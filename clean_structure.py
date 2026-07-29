import os

def clean_structure(startpath='.', exclude=None, max_depth=5):
    if exclude is None:
        exclude = {
            'venv', '.venv', '__pycache__', 'node_modules', '.git', 
            'uploads', 'evaluation_results', '.vscode', 'build', 'dist',
            '*.pyc', '*.pyo', '*.so', '*.dll', '*.exe'
        }
    
    print(f"\n{'='*60}")
    print(f"📁 СТРУКТУРА ПРОЄКТУ: {os.path.basename(os.path.abspath(startpath))}")
    print(f"{'='*60}\n")
    
    def should_exclude(name):
        for ex in exclude:
            if ex.startswith('*'):
                if name.endswith(ex[1:]):
                    return True
            elif name == ex:
                return True
        return False
    
    def print_tree(path, prefix='', depth=0):
        if depth > max_depth:
            return
        
        try:
            items = sorted([f for f in os.listdir(path) if not should_exclude(f)])
        except PermissionError:
            return
        
        for i, item in enumerate(items):
            full_path = os.path.join(path, item)
            is_last = (i == len(items) - 1)
            
            connector = '└── ' if is_last else '├── '
            print(prefix + connector + item + ('/' if os.path.isdir(full_path) else ''))
            
            if os.path.isdir(full_path):
                extension = '    ' if is_last else '│   '
                print_tree(full_path, prefix + extension, depth + 1)
    
    print_tree(startpath)
    print(f"\n{'='*60}")

if __name__ == "__main__":
    clean_structure(max_depth=4)  # startpath='.' за замовчуванням