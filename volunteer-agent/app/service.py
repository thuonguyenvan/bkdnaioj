"""Install/uninstall olpai-volunteer as a system service."""
from __future__ import annotations
import platform
import shutil
import subprocess
import sys
from pathlib import Path


def _agent_bin() -> str:
    bin_path = shutil.which("olpai-volunteer")
    if bin_path:
        return bin_path
    return sys.executable + " -m app.cli"


def install() -> None:
    system = platform.system()
    if system == "Darwin":
        _install_macos()
    elif system == "Linux":
        _install_linux()
    else:
        raise RuntimeError(f"Service install not supported on {system}")


def uninstall() -> None:
    system = platform.system()
    if system == "Darwin":
        _uninstall_macos()
    elif system == "Linux":
        _uninstall_linux()
    else:
        raise RuntimeError(f"Service uninstall not supported on {system}")


def start() -> None:
    system = platform.system()
    if system == "Darwin":
        subprocess.run(["launchctl", "start", "com.olpai.volunteer-agent"], check=True)
    elif system == "Linux":
        subprocess.run(["systemctl", "--user", "start", "olpai-volunteer"], check=True)


def stop() -> None:
    system = platform.system()
    if system == "Darwin":
        subprocess.run(["launchctl", "stop", "com.olpai.volunteer-agent"], check=False)
    elif system == "Linux":
        subprocess.run(["systemctl", "--user", "stop", "olpai-volunteer"], check=False)


# ── macOS LaunchAgent ────────────────────────────────────────────────────────

_PLIST_PATH = Path.home() / "Library" / "LaunchAgents" / "com.olpai.volunteer-agent.plist"
_LOG_DIR     = Path.home() / ".olpai" / "agent" / "logs"

_PLIST_TEMPLATE = """\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.olpai.volunteer-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>{bin}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>{log_dir}/stdout.log</string>
  <key>StandardErrorPath</key> <string>{log_dir}/stderr.log</string>
</dict>
</plist>
"""


def _install_macos() -> None:
    _LOG_DIR.mkdir(parents=True, exist_ok=True)
    plist = _PLIST_TEMPLATE.format(bin=_agent_bin(), log_dir=_LOG_DIR)
    _PLIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    _PLIST_PATH.write_text(plist)
    subprocess.run(["launchctl", "load", str(_PLIST_PATH)], check=True)
    print(f"Service installed: {_PLIST_PATH}")
    print(f"Logs: {_LOG_DIR}/stdout.log")


def _uninstall_macos() -> None:
    if _PLIST_PATH.exists():
        subprocess.run(["launchctl", "unload", str(_PLIST_PATH)], check=False)
        _PLIST_PATH.unlink()
        print("Service uninstalled.")
    else:
        print("Service not found.")


# ── Linux systemd (user unit) ────────────────────────────────────────────────

_UNIT_DIR  = Path.home() / ".config" / "systemd" / "user"
_UNIT_FILE = _UNIT_DIR / "olpai-volunteer.service"

_UNIT_TEMPLATE = """\
[Unit]
Description=OLPAI Volunteer Judge Agent
After=network.target

[Service]
ExecStart={bin} start
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
"""


def _install_linux() -> None:
    _UNIT_DIR.mkdir(parents=True, exist_ok=True)
    _UNIT_FILE.write_text(_UNIT_TEMPLATE.format(bin=_agent_bin()))
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "olpai-volunteer"], check=True)
    print(f"Service installed: {_UNIT_FILE}")
    print("Run: systemctl --user start olpai-volunteer")


def _uninstall_linux() -> None:
    if _UNIT_FILE.exists():
        subprocess.run(["systemctl", "--user", "disable", "--now", "olpai-volunteer"], check=False)
        _UNIT_FILE.unlink()
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
        print("Service uninstalled.")
    else:
        print("Service not found.")
