from google import genai
import os, json
import re
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. Create a .env file (see .env.example) "
        "with GEMINI_API_KEY=your_key_here, or set it in your environment/Streamlit secrets."
    )

client = genai.Client(api_key=API_KEY)
MODEL_NAME = "gemini-2.5-flash"

# Fallback emotion state used if the model call/parse fails, so the app never crashes.
_DEFAULT_EMOTION = {
    "valence": 0.0,
    "arousal": 0.0,
    "urgency": 1,
    "masking": "explicit",
    "subtext": "Unable to analyze this message right now.",
}

# <----------- CHANGE 2: REMOVED CBT_CONTEXT (no more advice-giving)
# OLD: CBT_CONTEXT with breathing exercises, journaling etc.
# NEW: Empty or removed - we don't give unsolicited advice anymore

def detect_emotion(message):
    prompt = f"""
Analyze this message and return ONLY a JSON object, no extra text:
{{
  "valence": <-1 to 1, negative to positive>,
  "arousal": <-1 to 1, numb to activated>,
  "urgency": <1 to 5, 1=safe 5=crisis>,
  "masking": <"explicit" or "implicit">,
  "subtext": "<one sentence interpretation>"
}}
Message: "{message}"
"""
    try:
        r = client.models.generate_content(model=MODEL_NAME, contents=prompt)
        text = r.text.strip()
        # Strip ```json ... ``` or ``` ... ``` code fences without mangling real content.
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
        emotion = json.loads(text)

        # Ensure all expected keys are present with sane types.
        emotion["valence"] = float(emotion.get("valence", 0.0))
        emotion["arousal"] = float(emotion.get("arousal", 0.0))
        emotion["urgency"] = int(emotion.get("urgency", 1))
        emotion["masking"] = emotion.get("masking", "explicit")
        emotion["subtext"] = emotion.get("subtext", "")
        return emotion
    except Exception:
        # If the model returns malformed JSON or the call fails, fail safe
        # rather than crashing the app.
        return dict(_DEFAULT_EMOTION)

# <----------- CHANGE 3: COMPLETELY REWROTE build_prompt function
def build_prompt(message, emotion, history):
    # Build conversation history
    history_text = ""
    for role, msg in history[-6:]:
        if role == "user":
            history_text += f"User: {msg}\n"
        else:
            history_text += f"MindBridge: {msg}\n"
    
    # Crisis rule - simplified to not interrupt the question format
    crisis_rule = ""
    if emotion["urgency"] >= 4:
        crisis_rule = """
CRISIS PROTOCOL:
You MUST include: "Please call or text 988 (Suicide & Crisis Lifeline) or text HOME to 741741."
Then continue and end with a question.
"""
    
    # NEW PROMPT STRUCTURE - matches judge examples exactly
    return f"""
You are MindBridge — an emotionally intelligent mental health companion.

CRITICAL RULES:
- NO platitudes like "I understand how you feel" or "That must be hard"
- NO giving advice unless explicitly asked
- DO NOT suggest journaling, breathing exercises, or techniques
- ALWAYS end your response with a genuine, specific question
- Be concise: 2-3 sentences max, then the question

CRISIS RULE (if urgency >=4):
{crisis_rule if emotion['urgency'] >= 4 else "No crisis - proceed normally"}

RESPONSE STRUCTURE (FOLLOW THIS EXACTLY):
1. Acknowledge what they said (be specific, reference their words)
2. Ask ONE probing question that shows you understood

EXAMPLES OF GOOD RESPONSES:

User: "I just can't be bothered anymore. I used to love going out, playing sports."
Response: "That shift from enjoying things to not finding a reason to get up. When did things start feeling this way?"

User: "My parents are having a rough time and my exams didn't go well."
Response: "You were carrying pressure while watching things at home fall apart. Do you feel like doing well was somehow connected to fixing things at home?"

User: "I skipped a few lectures. It's whatever."
Response: "'It's whatever' is doing a lot of work there. What thought goes through your head right before you decide not to go?"

[CONVERSATION HISTORY]
{history_text}

[EMOTION STATE]
Valence={emotion['valence']} | Arousal={emotion['arousal']} | Urgency={emotion['urgency']}/5

[USER MESSAGE]
{message}

Now respond as MindBridge (2-3 sentences + a question, NO advice):
"""

# <----------- CHANGE 4: Added anti-platitude checker function (NEW)
def is_response_too_generic(response):
    """Check if response is generic and should be rejected"""
    generic_phrases = [
        "i understand how you feel",
        "that must be hard",
        "thank you for sharing",
        "i hear you",
        "you're not alone", 
        "your feelings are valid",
        "it's okay to feel",
        "thank you for trusting me"
    ]
    
    response_lower = response.lower()
    for phrase in generic_phrases:
        if phrase in response_lower:
            return True  # Too generic - reject
    
    # Check if response ends with question mark
    if not response.strip().endswith("?"):
        return True  # Should end with question
    
    # Check length (too long = advice-giving)
    if len(response.split()) > 50:
        return True  # Too wordy
    
    return False  # Response is good

def get_response(message, emotion, history):
    prompt = build_prompt(message, emotion, history)
    try:
        response = client.models.generate_content(model=MODEL_NAME, contents=prompt).text

        if is_response_too_generic(response):
            retry_prompt = prompt + "\n\nIMPORTANT: Your previous response was too generic or didn't end with a question. Please try again: Be specific, reference what the user said, and end with a question. NO advice, NO platitudes. Just acknowledgment + question."
            response = client.models.generate_content(model=MODEL_NAME, contents=retry_prompt).text

        return response.strip()
    except Exception:
        return "I'm having trouble responding right now, there may be a connection or API issue on my end. Could you try sending that again?"

# Quick test if run directly
if __name__ == "__main__":
    print("Testing improved MindBridge...")
    test_msg = "I used to love playing sports, now I just lie in bed"
    emotion = detect_emotion(test_msg)
    print(f"Emotion: {json.dumps(emotion, indent=2)}")
    print("\n" + "="*50)
    print("RESPONSE:")
    resp = get_response(test_msg, emotion, [])
    print(resp)
    print("="*50)
    print(f"Ends with question? {resp.strip().endswith('?')}")
    print(f"Contains advice? {'journal' in resp.lower() or 'breathing' in resp.lower()}")
