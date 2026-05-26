import os
import subprocess
import tempfile
import shutil

BASE_DIR = "/Users/quangsang/Documents/personal/bkdnaioj/draft/adversarial_attack"
BTC_DIR = os.path.join(BASE_DIR, "btc_upload")
CONTESTANT_DIR = os.path.join(BASE_DIR, "contestant_upload")

def run_test():
    print("=== Testing Direct ZIP Submissions (Phase 1 / Non-final) ===")
    
    # 1. Test perfect_adversarial_images.zip
    print("\n1. Running judge on perfect_adversarial_images.zip...")
    temp_sub_dir = tempfile.mkdtemp()
    shutil.copy(os.path.join(CONTESTANT_DIR, "perfect_adversarial_images.zip"), temp_sub_dir)
    
    p = subprocess.run([
        "python3",
        os.path.join(BTC_DIR, "judge.py"),
        "--submission-dir", temp_sub_dir,
        "--assets-dir", BTC_DIR,
        "--output-dir", os.path.join(BASE_DIR, "temp_out"),
        "--context", "dummy_context"
    ], capture_output=True, text=True)
    
    print("Exit code:", p.returncode)
    print("Output:", p.stdout)
    shutil.rmtree(temp_sub_dir)
    
    # 2. Test poor_adversarial_images.zip
    print("\n2. Running judge on poor_adversarial_images.zip...")
    temp_sub_dir = tempfile.mkdtemp()
    shutil.copy(os.path.join(CONTESTANT_DIR, "poor_adversarial_images.zip"), temp_sub_dir)
    
    p = subprocess.run([
        "python3",
        os.path.join(BTC_DIR, "judge.py"),
        "--submission-dir", temp_sub_dir,
        "--assets-dir", BTC_DIR,
        "--output-dir", os.path.join(BASE_DIR, "temp_out"),
        "--context", "dummy_context"
    ], capture_output=True, text=True)
    
    print("Exit code:", p.returncode)
    print("Output:", p.stdout)
    shutil.rmtree(temp_sub_dir)

    print("\n=== Testing Code Submissions (Phase 2 / Final) ===")
    
    # To test code submission, we simulate the worker runner:
    # A. Extract contestant submission_perfect.zip to a folder
    # B. Run infer.py inside a sandbox-like environment (python3 infer.py)
    # C. Run judge.py on the output of infer.py
    
    print("\n3. Testing perfect code submission (submission_perfect.zip)...")
    temp_work_dir = tempfile.mkdtemp()
    sub_dir = os.path.join(temp_work_dir, "submission")
    out_dir = os.path.join(temp_work_dir, "output")
    os.makedirs(sub_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    
    # Extract code
    import zipfile
    with zipfile.ZipFile(os.path.join(CONTESTANT_DIR, "submission_perfect.zip"), 'r') as zf:
        zf.extractall(sub_dir)
        
    # Run inference
    p_infer = subprocess.run([
        "python3",
        os.path.join(sub_dir, "infer.py"),
        "--submission-dir", sub_dir,
        "--assets-dir", BTC_DIR,
        "--output-dir", out_dir,
        "--context", "dummy_context"
    ], capture_output=True, text=True)
    print("Infer exit code:", p_infer.returncode)
    if p_infer.returncode != 0:
        print("Infer error:", p_infer.stderr)
        
    # Run judge on the generated outputs
    p_judge = subprocess.run([
        "python3",
        os.path.join(BTC_DIR, "judge.py"),
        "--submission-dir", out_dir,
        "--assets-dir", BTC_DIR,
        "--output-dir", os.path.join(temp_work_dir, "judge_out"),
        "--context", "dummy_context"
    ], capture_output=True, text=True)
    print("Judge exit code:", p_judge.returncode)
    print("Judge output:", p_judge.stdout)
    
    shutil.rmtree(temp_work_dir)

    print("\n4. Testing poor code submission (submission_poor.zip)...")
    temp_work_dir = tempfile.mkdtemp()
    sub_dir = os.path.join(temp_work_dir, "submission")
    out_dir = os.path.join(temp_work_dir, "output")
    os.makedirs(sub_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    
    with zipfile.ZipFile(os.path.join(CONTESTANT_DIR, "submission_poor.zip"), 'r') as zf:
        zf.extractall(sub_dir)
        
    p_infer = subprocess.run([
        "python3",
        os.path.join(sub_dir, "infer.py"),
        "--submission-dir", sub_dir,
        "--assets-dir", BTC_DIR,
        "--output-dir", out_dir,
        "--context", "dummy_context"
    ], capture_output=True, text=True)
    print("Infer exit code:", p_infer.returncode)
    
    p_judge = subprocess.run([
        "python3",
        os.path.join(BTC_DIR, "judge.py"),
        "--submission-dir", out_dir,
        "--assets-dir", BTC_DIR,
        "--output-dir", os.path.join(temp_work_dir, "judge_out"),
        "--context", "dummy_context"
    ], capture_output=True, text=True)
    print("Judge exit code:", p_judge.returncode)
    print("Judge output:", p_judge.stdout)
    
    shutil.rmtree(temp_work_dir)
    
    # Clean up temp_out dir
    temp_out_dir = os.path.join(BASE_DIR, "temp_out")
    if os.path.exists(temp_out_dir):
        shutil.rmtree(temp_out_dir)

if __name__ == "__main__":
    run_test()
