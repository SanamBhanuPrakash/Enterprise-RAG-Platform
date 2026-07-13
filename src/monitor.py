import time
import subprocess
import os
import sys
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# ==============================================================================
# 1. THE EVENT HANDLER (What to do when a file drops)
# ==============================================================================
class RAGEventHandler(FileSystemEventHandler):
    def on_created(self, event):
        # Ignore folder creations, only care about actual files
        if not event.is_directory:
            print(f"\n👀 [WATCHDOG] New file detected: {os.path.basename(event.src_path)}")
            print("🚀 [WATCHDOG] Triggering automatic database rebuild...")
            
            # This automatically runs your ingestion.py script
            subprocess.run([sys.executable, "src/ingestion.py"])
            
            print("\n✅ [WATCHDOG] System updated! Waiting for new files...")

# ==============================================================================
# 2. THE OBSERVER (The infinite loop that watches the folder)
# ==============================================================================
def start_monitoring():
    # Point the watchdog exactly at your private_data folder
    target_folder = os.path.join(os.path.dirname(__file__), '..', 'private_data')
    
    event_handler = RAGEventHandler()
    observer = Observer()
    
    # Schedule the watcher
    observer.schedule(event_handler, target_folder, recursive=False)
    observer.start()
    
    print("=====================================================")
    print(f"🛡️  Security Watchdog Active.")
    print(f"📂 Monitoring folder: private_data")
    print("Drop a new PDF, TXT, or PY file in the folder to test!")
    print("Press Ctrl+C to stop the monitor.")
    print("=====================================================\n")
    
    try:
        # Keep the script running forever (checking every 1 second)
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[WATCHDOG] Shutting down...")
        observer.stop()
    observer.join()

if __name__ == "__main__":
    start_monitoring()