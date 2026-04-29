import streamlit as st
import os
import sys
import requests

# API base URL (FastAPI backend)
API_BASE_URL = os.getenv("POLICY_AI_API_BASE", "http://localhost:8000")

st.set_page_config(page_title="Policy-AI Prototype", layout="wide")

# Initialize Session State
if "messages" not in st.session_state:
    st.session_state.messages = []
if "summary" not in st.session_state:
    st.session_state.summary = None
if "key_points" not in st.session_state:
    st.session_state.key_points = []
if "pipeline_ready" not in st.session_state:
    st.session_state.pipeline_ready = False

# --- SIDEBAR: Upload & Summary ---
with st.sidebar:
    st.title("🛡️ Policy-AI")
    st.markdown("---")
    uploaded_file = st.file_uploader("Upload a Policy PDF", type="pdf")

    if uploaded_file and st.button("Process Document"):
        with st.spinner("Analyzing document..."):
            try:
                files = {
                    "file": (
                        uploaded_file.name,
                        uploaded_file.getvalue(),
                        "application/pdf",
                    )
                }
                # First run may take longer while models download; allow a generous timeout.
                resp = requests.post(f"{API_BASE_URL}/upload", files=files, timeout=300)
                resp.raise_for_status()
                data = resp.json()
                st.session_state.summary = data.get("summary")
                st.session_state.key_points = data.get("key_points", []) or []
                st.session_state.pipeline_ready = True
                st.success("Analysis Complete!")
            except Exception as e:
                st.session_state.pipeline_ready = False
                st.error(f"Failed to process document via API: {e}")

    if st.session_state.summary:
        st.subheader("Key Clauses (auto-selected)")
        for kp in st.session_state.key_points:
            preview = kp.get("preview", "")
            clause = kp.get("clause", "")
            idx = kp.get("index", 0)
            with st.expander(f"Clause {idx + 1}: {preview}"):
                st.write(clause)

        st.subheader("Document Summary")
        st.info(st.session_state.summary)

# --- MAIN: Chat Interface ---
st.header("Ask about Clauses")

# Display chat history
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# User Input
if prompt := st.chat_input("Ex: Can they share my data?"):
    if not st.session_state.pipeline_ready:
        st.warning("Please upload and process a document first.")
    else:
        # Add user message to chat
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        # Generate LLM response via API
        with st.chat_message("assistant"):
            with st.spinner("Searching clauses..."):
                try:
                    resp = requests.post(
                        f"{API_BASE_URL}/query",
                        json={"question": prompt},
                        timeout=120,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    answer = data.get("answer", "")
                    sources = data.get("sources", []) or []

                    full_response = f"{answer}\n\n**Found in these clauses:**\n"
                    for src in sources:
                        idx = src.get("index", 0)
                        text = src.get("text", "")
                        snippet = text.replace("\n", " ").strip()[:300]
                        full_response += f"\n- Clause {idx + 1}: {snippet}..."

                    st.markdown(full_response)
                    st.session_state.messages.append(
                        {"role": "assistant", "content": full_response}
                    )
                except Exception as e:
                    error_msg = f"Error querying API: {e}"
                    st.error(error_msg)
                    st.session_state.messages.append(
                        {"role": "assistant", "content": error_msg}
                    )