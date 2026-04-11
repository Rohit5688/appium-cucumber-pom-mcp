import os
import sys

MODEL_FILE = os.path.join(os.getcwd(), ".AppForge", "active_model.txt")
MODELS = [
    "gemini-1.5-flash", "gemini-1.5-pro", 
    "gemini-3.1-pro-h", "gemini-3.1-pro-l", 
    "claude-4.6-sonnet", "claude-4.6-opus", "claude-4.5-sonnet",
    "claude-3.5-sonnet", "claude-3-opus"
]

def main():
    if len(sys.argv) < 2:
        print(f"Usage: python scripts/set_model.py <model_name>")
        print(f"Supported: {', '.join(MODELS)}")
        sys.exit(1)
        
    model = sys.argv[1].lower()
    if model not in MODELS:
        print(f"Error: Unsupported model '{model}'")
        sys.exit(1)
        
    os.makedirs(os.path.dirname(MODEL_FILE), exist_ok=True)
    with open(MODEL_FILE, 'w') as f:
        f.write(model)
    
    print(f"Token monitor model set to: \033[95m{model}\033[0m")

if __name__ == "__main__":
    main()
