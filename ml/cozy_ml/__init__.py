"""cozy-ml: distill and fine-tune Muse-series open-weight models on lab-loop data.

Kept import-light on purpose: data/config/eval modules use the standard
library only so `python -m unittest` runs with zero third-party installs.
Heavy deps (torch, transformers, peft, trl) load only inside models/ and
train/ at call time.
"""

__version__ = "0.1.0"
