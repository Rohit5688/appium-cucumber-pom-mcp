import sys
import re

def compress(text):
    # Normalize whitespace/newlines
    text = re.sub(r"\s+", " ", text).strip()
    
    # 1. Strip Politeness and Greetings (Case Insensitive)
    fluff = [
        r"\b(hi|hello|hey|there|hope you are well|good (morning|afternoon|evening))\b",
        r"\b(please|kindly|could you|would you|can you|if you don't mind)\b",
        r"\b(i (would like|want|need|beg) you to|i'm (looking|telling) you to|i have|so i)\b",
        r"\b(it would be (helpful|great) if you could)\b",
        r"\b(thank you|thanks|regards|best)\b",
        r"\b(i think|i believe|maybe|perhaps|possibly|i might have|i will give you brief of)\b",
        r"\b(and try (to )?find|try to identify|while implementing task in|these are few issues we found while live session)\b",
        r"\b(if we keep doing development like this|we are not going live|with me)\b"
    ]
    for pattern in fluff:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)

    # 2. Strip Articles and Fillers
    articles = r"\b(the|a|an|any|some|that|what is your|before starting)\b"
    text = re.sub(articles, "", text, flags=re.IGNORECASE)

    # 3. Simple Passive/Request to Imperative mapping (Heuristics)
    text = re.sub(r"\bhelp me (with|to)\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\btake look at\b", "look at", text, flags=re.IGNORECASE)
    text = re.sub(r"\bmissed\?\b", "", text, flags=re.IGNORECASE).strip()
    
    # 4. Strip redundant prepositions
    text = re.sub(r"\b(of|at|in|on|to|for) \b", " ", text, flags=re.IGNORECASE)

    # 5. Clean up extra spaces and punctuation
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^[.,!?;: ]+|[.,!?;: ]+$", "", text).strip()
    
    # Capitalize first letter (Caveman style)
    if text:
        text = text[0].upper() + text[1:]
        if not text.endswith("."):
            text += "."

    return text

if __name__ == "__main__":
    input_text = ""
    if len(sys.argv) > 1:
        input_text = " ".join(sys.argv[1:])
    else:
        input_text = sys.stdin.read()
    
    if not input_text.strip():
        print("Usage: python compress_prompt.py <text>")
        sys.exit(1)
        
    print(compress(input_text))
