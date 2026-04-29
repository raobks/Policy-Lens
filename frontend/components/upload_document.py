import streamlit as st
import requests

API_URL = "http://localhost:8000/upload"

st.title("Policy-AI Document Analyzer")

uploaded_file = st.file_uploader("Upload a government policy PDF", type=["pdf"])

if uploaded_file is not None:
    if st.button("Analyze Document"):

        files = {"file": (uploaded_file.name, uploaded_file, "application/pdf")}

        with st.spinner("Processing document..."):
            response = requests.post(API_URL, files=files)

        if response.status_code == 200:
            data = response.json()

            st.session_state["summary"] = data["summary"]
            st.session_state["summary_map"] = data["summary_map"]
            st.session_state["key_points"] = data["key_points"]

            st.success("Document processed successfully!")

        else:
            st.error("Failed to process document.")