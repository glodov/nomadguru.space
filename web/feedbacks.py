#!python
import os
import yaml
import shutil
from datetime import datetime
import hashlib
import argparse

# @add YELLOW
YELLOW = '\033[93m'  # Yellow Text
GREEN = '\033[92m'  # Green Text
RED   = '\033[91m'  # Red Text
RESET = '\033[0m'   # Reset to default 

PUBLIC_DIR = "./public/dev"

tracing = []
progress = []
yaml_progress = []
files_progress = []

def load_yaml_options(options_file, user_name):
    if os.path.exists(options_file):
        with open(options_file, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    return None

def process_feedback(uri, feedback, options, files_dir):
    # Convert the date from the JSON format
    date_obj = datetime.fromtimestamp(feedback['date'] / 1000.0)
    formatted_date = date_obj.strftime('%Y-%m-%d %H:%M')

    feedback_yaml = {
        'from': options.get('from', ''),
        'to': options.get('to', ''),
        'time': feedback['date'],
        'date': formatted_date,
        'done': feedback.get('done', None),
        'message': feedback['text'],
        'files': [] # To be filled with non .json, .yaml files
    }

    # Recursively get all files excluding .json and .yaml
    for root, dirs, files in os.walk(files_dir):
        for file in files:
            if not file.endswith(('.json', '.yaml')):
                relative_path = os.path.relpath(root, files_dir)
                if relative_path == uri:
                    feedback_yaml['files'].append(file)

    return feedback_yaml

def file_hash(file_path):
    hash_md5 = hashlib.md5()
    with open(file_path, 'rb') as file:
        for chunk in iter(lambda: file.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def print_progress(same, uri, file_name, feedback_yaml):
    global tracing
    tracing.append([f"  {RESET if same else GREEN}•{RESET} {uri}/{file_name}", True])
    if len(feedback_yaml['files']):
        for file in feedback_yaml['files']:
            tracing.append([f"   • {file}", True])

def save_feedback_yaml(feedback_yaml, uri, user_name):
    file_name = f"{feedback_yaml['date'][0:10]}-{user_name}.yaml"
    file_path = os.path.join(PUBLIC_DIR, uri, file_name)

    # Create the directory if it does not exist
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    # Check if file exists and compare hashes
    if os.path.exists(file_path):
        existing_hash = file_hash(file_path)
        feedback_yaml_str = yaml.dump(feedback_yaml, allow_unicode=True)
        new_hash = hashlib.md5(feedback_yaml_str.encode('utf-8')).hexdigest()

        if existing_hash == new_hash:
            print_progress(True, uri, file_name, feedback_yaml)
            return False

    # Write the file if it does not exist or content is different
    with open(file_path, 'w', encoding='utf-8') as file:
        file.write(yaml.dump(feedback_yaml, allow_unicode=True))
        print_progress(False, uri, file_name, feedback_yaml)
    return True

def copy_feedback_files(current_dir):
    copied = {}
    for root, dirs, files in os.walk(current_dir):
        for file in files:
            source_path = os.path.join(root, file)
            relative_path = os.path.relpath(root, current_dir)
            destination_path = os.path.join(PUBLIC_DIR, relative_path, file)

            os.makedirs(os.path.dirname(destination_path), exist_ok=True)
            copied[destination_path] = False
            if not os.path.exists(destination_path):
                shutil.copy2(source_path, destination_path)
                copied[destination_path] = True
    return copied

def process_dirs(current_dir, user_name, options):
    global tracing
    global progress
    global files_progress
    global yaml_progress
    for file in os.listdir(current_dir):
        if "_.yaml" == file:
            continue
        path = os.path.join(current_dir, file)
        if os.path.isdir(path):
            process_dirs(path, user_name, options)
            continue
        # Process YAML files
        if file.endswith('.yaml'):
            yaml_file = os.path.join(current_dir, file)
            files_dir = os.path.join(current_dir, "files")
            copied = copy_feedback_files(files_dir)
            with open(yaml_file, 'r', encoding='utf-8') as fp:
                data = yaml.safe_load(fp)
                tracing.append([f" {GREEN}•{RESET} {file}", True])
                done_count = 0
                total_count = len(data['feedback'].items())
                for uri, feedback in data['feedback'].items():
                    start = RED
                    if feedback.get('done', None):
                        done_count += 1
                        start = GREEN
                    if '' == feedback['text']:
                        progress.append("•")
                        tracing.append([f"   {RED}• no text{RESET} in {uri}", False])
                        continue
                    progress.append(f"{start}•{RESET}")
                    feedback_yaml = process_feedback(uri, feedback, options, files_dir)
                    saved = save_feedback_yaml(feedback_yaml, uri, user_name)
                    for f in feedback_yaml['files']:
                        u = os.path.join(PUBLIC_DIR, uri, f)
                        if copied.get(u, False):
                            tracing.append([f"   {GREEN}+{RESET} {f}"])
                            files_progress.append(f"{GREEN}+{RESET}")
                        else:
                            tracing.append([f"   • {f}"])
                            files_progress.append(f"{YELLOW}•{RESET}")
                    if saved:
                        yaml_progress.append(f"{GREEN}+{RESET}")
                    else:
                        yaml_progress.append(f"{YELLOW}•{RESET}")
                color = GREEN
                percentage = 100 * done_count / total_count
                if percentage < 50:
                    color = RED
                elif percentage < 100:
                    color = YELLOW
                progress.insert(0, f"{color}{percentage:.1f}{RESET}%")

def process_files(dir):
    for user_name in os.listdir(dir):
        user_dir = os.path.join(dir, user_name)
        if os.path.isdir(user_dir):
            options_file = os.path.join(user_dir, '_.yaml')
            options = load_yaml_options(options_file, user_name)
            if None == options:
                options = {}
            global tracing
            global progress
            global yaml_progress
            global files_progress
            tracing = []
            progress = []
            yaml_progress = []
            files_progress = []
            print(f"{user_name} ", end="")
            process_dirs(user_dir, user_name, options)
            print(' '.join(progress))
            if len(yaml_progress):
                print(" " + ' '.join(yaml_progress))
            else:
                print(f" {RED}no feedbacks{RESET}")
            if len(files_progress): 
                print(" " + ' '.join(files_progress))
            else:
                print(f" {YELLOW}no files{RESET}")
            global args
            if args.trace:
                for row in tracing:
                    print(row[0])

def parse_args():
    parser = argparse.ArgumentParser(description='Process feedback files from the DEV page')
    parser.add_argument('--trace', action='store_true', help='Enable tracing output')
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    process_files("./feedbacks")

