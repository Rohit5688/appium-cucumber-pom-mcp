import os
import time
import sys
import re

# Antigravity App Data Paths
BRAIN_PATH = r"C:\Users\Rohit\.gemini\antigravity\brain"
PID_FILE = os.path.join(os.getcwd(), ".AppForge", "token_monitor.pid")
MODEL_FILE = os.path.join(os.getcwd(), ".AppForge", "active_model.txt")
TOKEN_RATIO = 1/4 # ~4 chars = 1 token

# Model Rates (Blended USD per 1M tokens)
# Note: These are blended averages of input/output for rough monitoring
MODEL_CONFIG = {
    "gemini-1.5-flash": {"name": "Gemini 1.5 Flash", "rate": 0.20},
    "gemini-1.5-pro":   {"name": "Gemini 1.5 Pro",   "rate": 7.00},
    "gemini-3.1-pro-h": {"name": "Gemini 3.1 Pro (High)", "rate": 10.00},
    "gemini-3.1-pro-l": {"name": "Gemini 3.1 Pro (Low)",  "rate": 5.00},
    "claude-4.6-sonnet":{"name": "Claude Sonnet 4.6", "rate": 12.00},
    "claude-4.6-opus":  {"name": "Claude Opus 4.6",   "rate": 20.00},
    "claude-4.5-sonnet":{"name": "Claude Sonnet 4.5", "rate": 8.00},
    "claude-3.5-sonnet":{"name": "Claude 3.5 Sonnet","rate": 9.00},
    "claude-3-opus":    {"name": "Claude 3 Opus",    "rate": 15.00},
    "default":          {"name": "Default Agent",    "rate": 6.00}
}

def get_current_model():
    """Detect the active model for segregation."""
    if os.path.exists(MODEL_FILE):
        try:
            with open(MODEL_FILE, 'r') as f:
                model_id = f.read().strip().lower()
                if model_id in MODEL_CONFIG:
                    return MODEL_CONFIG[model_id]
        except:
            pass
    return MODEL_CONFIG["gemini-1.5-flash"] # Default to Flash as per user request

def check_single_instance():
    """Ensure only one instance is running."""
    os.makedirs(os.path.dirname(PID_FILE), exist_ok=True)
    if os.path.exists(PID_FILE):
        try:
            with open(PID_FILE, 'r') as f:
                pid = int(f.read().strip())
            # Check if process is actually running
            if os.name == 'nt':
                import ctypes
                PROCESS_QUERY_INFORMATION = 0x0400
                handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_INFORMATION, False, pid)
                if handle:
                    ctypes.windll.kernel32.CloseHandle(handle)
                    print(f"Monitor already running (PID {pid}). Exiting.")
                    sys.exit(0)
        except (ValueError, ProcessLookupError):
            pass
    
    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))

def cleanup():
    """Remove PID file on exit."""
    if os.path.exists(PID_FILE):
        os.remove(PID_FILE)

def get_active_session():
    """Find the most recently modified conversation directory."""
    try:
        subdirs = [os.path.join(BRAIN_PATH, d) for d in os.listdir(BRAIN_PATH) 
                  if os.path.isdir(os.path.join(BRAIN_PATH, d)) and d != "tempmediaStorage"]
        if not subdirs:
            return None
        return max(subdirs, key=os.path.getmtime)
    except Exception as e:
        return None

def count_tokens_in_file(filepath):
    """Estimate tokens in a single file."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            return len(content) * TOKEN_RATIO
    except:
        return 0

def scan_session(session_path):
    """Recursively scan session for tool/step output files."""
    total_tokens = 0
    file_count = 0
    
    # Antigravity stores step outputs in .system_generated/steps/<num>/output.txt
    steps_path = os.path.join(session_path, ".system_generated", "steps")
    if os.path.exists(steps_path):
        for root, _, files in os.walk(steps_path):
            for file in files:
                if file == "output.txt":
                    total_tokens += count_tokens_in_file(os.path.join(root, file))
                    file_count += 1
                    
    # Also check scratch files for large data dumps
    scratch_path = os.path.join(session_path, "scratch")
    if os.path.exists(scratch_path):
         for f in os.listdir(scratch_path):
                total_tokens += count_tokens_in_file(os.path.join(scratch_path, f))
                file_count += 1

    return total_tokens, file_count

def main():
    check_single_instance()
    try:
        print("\033[96m" + "="*50)
        print("  ANTIGRAVITY REAL-TIME TOKEN MONITOR  ")
        print("="*50 + "\033[0m")
        
        active_session = get_active_session()
        if not active_session:
            print("Waiting for active Antigravity session...")
            while not active_session:
                time.sleep(5)
                active_session = get_active_session()
                
        session_id = os.path.basename(active_session)
        print(f"Tracking Session: \033[93m{session_id}\033[0m")
        print("Press Ctrl+C to stop.\n")

        last_tokens = 0
        while True:
            # Detect model and specific rate
            model = get_current_model()
            
            # Check if session switched
            current_session = get_active_session()
            if current_session != active_session:
                active_session = current_session
                session_id = os.path.basename(active_session)
                print(f"\n\033[92m[ALERT]\033[0m Session Changed: {session_id}")

            tokens, files = scan_session(active_session)
            
            if tokens != last_tokens:
                new_tokens = tokens - last_tokens
                cost = (tokens / 1_000_000) * model["rate"]
                
                # ANSI formatting for dashboard
                sys.stdout.write("\033[K") # Clear line
                print(f"\r[\033[94m{time.strftime('%H:%M:%S')}\033[0m] "
                      f"Agent: \033[95m{model['name']}\033[0m | "
                      f"Tokens: \033[92m{int(tokens):,}\033[0m "
                      f"(\033[93m+ {int(new_tokens):,}\033[0m) "
                      f"| Cost: \033[92m${cost:,.4f}\033[0m", end="")
                last_tokens = tokens
                
            time.sleep(2)
    except KeyboardInterrupt:
        model = get_current_model()
        print("\n\nMonitor stopped. Final Summary:")
        tokens, _ = scan_session(active_session)
        cost = (tokens / 1_000_000) * model["rate"]
        print(f"Agent Used: {model['name']}")
        print(f"Total Session Tokens: {int(tokens):,}")
        print(f"Estimated Total Cost: ${cost:,.4f}")
    finally:
        cleanup()

if __name__ == "__main__":
    main()
