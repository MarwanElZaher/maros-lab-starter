import sys
from pathlib import Path
# Allow "from app.xxx" imports when pytest runs from this directory
sys.path.insert(0, str(Path(__file__).parent.parent))
