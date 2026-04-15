import streamlit as st
from core import detect_emotion, get_response

st.set_page_config(page_title="MindBridge", page_icon="🧠")
st.title("🧠 MindBridge")
st.caption("Emotionally Intelligent Conversational AI")

if "history" not in st.session_state:
    st.session_state.history = []
if "emotions" not in st.session_state:
    st.session_state.emotions = []

# Sidebar — emotion display
with st.sidebar:
    st.header("Emotion State")
    if st.session_state.emotions:
        e = st.session_state.emotions[-1]
        st.metric("Valence", f"{e['valence']:+.1f}")
        st.metric("Arousal", f"{e['arousal']:+.1f}")
        st.metric("Urgency", f"{e['urgency']} / 5")
        st.write(f"Masking: {e['masking']}")
        st.info(f"💭 {e['subtext']}")
    else:
        st.write("Start chatting to see emotion analysis.")

# Chat history display
for role, msg in st.session_state.history:
    with st.chat_message(role):
        st.write(msg)

# Input
user_input = st.chat_input("How are you feeling today?")

if user_input:
    # Show user message
    st.session_state.history.append(("user", user_input))
    with st.chat_message("user"):
        st.write(user_input)

    with st.spinner("MindBridge is thinking..."):
        emotion = detect_emotion(user_input)
        st.session_state.emotions.append(emotion)

        # Crisis card
        if emotion["urgency"] >= 4:
            st.error("🚨 Crisis Support Available\n\nCall or text 988 (Suicide & Crisis Lifeline)\nText HOME to 741741 (Crisis Text Line)")

        response = get_response(user_input, emotion, st.session_state.history)

    st.session_state.history.append(("assistant", response))
    with st.chat_message("assistant"):
        st.write(response)
