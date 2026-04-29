import streamlit as st

st.title("Policy-AI Results")

summary = st.session_state.get("summary", "")
summary_map = st.session_state.get("summary_map", [])
key_points = st.session_state.get("key_points", [])

if not summary:
    st.warning("No document processed yet.")
else:

    st.header("Document Summary")
    st.write(summary)

    st.divider()

    st.header("Key Points")

    for kp in key_points:
        st.markdown(f"• {kp['preview']}")

    st.divider()

    st.header("Traceable Summary")

    for item in summary_map:
        with st.expander(item["summary_sentence"]):
            st.write("Source paragraph:")
            st.write(item["source_paragraph"])