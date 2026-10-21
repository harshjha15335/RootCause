"""Stage a reproducible Function deployment with shared code and locked dependencies."""

import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
output = root / ".build" / "function"
if output.is_symlink():
    raise RuntimeError("Function staging directory cannot be a symlink")
if output.exists():
    shutil.rmtree(output)  # Generated staging only; remove obsolete modules from earlier builds.
output.mkdir(parents=True, exist_ok=True)
for name in ("api", "agents"):
    shutil.copytree(
        root / name,
        output / name,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )
for name in ("function_app.py", "host.json"):
    shutil.copy2(root / "functions" / "goal_detector" / name, output / name)
shutil.copy2(root / "requirements.txt", output / "requirements.txt")
print("Function package staged in .build/function")
