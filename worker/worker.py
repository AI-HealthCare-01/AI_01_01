import time
from datetime import datetime, timezone


def main() -> None:
    while True:
        now = datetime.now(timezone.utc).isoformat()
        print(f"[worker] heartbeat {now}", flush=True)
        time.sleep(30)


if __name__ == "__main__":
    main()
