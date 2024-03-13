import zipfile
import os
import shutil
import yaml

GREEN = '\033[92m'  # Green Text       ✓
RED   = '\033[91m'  # Red Text         ×
RESET = '\033[0m'   # Reset to default 
NANO  = '•'
OK    = '✓'
FAIL  = '×'
ARROW = '›'

def trace(msg, status=False, char=None, end="\n"):
    if None == char:
        char = OK if status else FAIL
    # char = OK if status else FAIL if char is None else char
    color = GREEN if status else RED
    terminal_width = shutil.get_terminal_size().columns
    max_msg_length = terminal_width - 4  # Adjust for space, char, color codes, etc.

    if len(msg) > max_msg_length:
        msg = msg[:max_msg_length - 2] + ".."
    else:
        # Pad the message with spaces if it's shorter than the maximum length
        msg = msg.ljust(max_msg_length)

    print(f" {color}{char}{RESET} {msg}", end=end)

def create_zip_archive_from_yaml(yaml_file, base_directory):
    data = { 'archives': [], 'sessionId': None }
    with open(yaml_file, 'r') as file:
        # Load data from a YAML file
        data = yaml.safe_load(file)

    for archive in data['archives']:
        archive_name = archive['zipPath']
        archive_base = os.path.basename(archive_name)
        # files_to_zip = [os.path.join(base_directory, file) for file in archive['files']]
        total_size = archive['size']
        files_count = len(archive['files'])
        i = 0
        with zipfile.ZipFile(archive_name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_base in archive['files']:
                i += 1
                file = os.path.join(base_directory, file_base)
                if os.path.exists(file):
                    zipf.write(file, arcname=file_base)
                    trace(f"{archive_base}  {100 * i / files_count:.1f}% {ARROW} {file_base}", status=True, end="\r")
                else:
                    trace(f"\n{file} does not exist")
        actual_size = os.path.getsize(archive_name) / 1024 / 1024
        trace(f"{os.path.basename(archive_name)} 100% of {total_size / 1024 / 1024:.1f}Mb {ARROW} {actual_size:.1f}Mb", status=True)

# @todo load and save from/to YAML instead of JSON
json_file = './.nw/publish.archive.meta.yaml'
base_directory = os.getcwd() + "/dist"

create_zip_archive_from_yaml(json_file, base_directory)