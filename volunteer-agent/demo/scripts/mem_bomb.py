"""Threat: memory bomb — escalates RAM until OOM."""
chunks = []
while True:
    chunks.append(bytearray(10 * 1024 * 1024))  # +10MB per iter
