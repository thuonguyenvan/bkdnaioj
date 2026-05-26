import os
import csv
import json
import zipfile
import struct
import shutil
import numpy as np

# Define directories
BASE_DIR = "/Users/quangsang/Documents/personal/bkdnaioj/draft/adversarial_attack"
BTC_DIR = os.path.join(BASE_DIR, "btc_upload")
CONTESTANT_DIR = os.path.join(BASE_DIR, "contestant_upload")
os.makedirs(BTC_DIR, exist_ok=True)
os.makedirs(CONTESTANT_DIR, exist_ok=True)

# Helper to save BMP
def save_bmp(path, img_data):
    width, height = 28, 28
    file_size = 54 + width * height * 3
    header = struct.pack(
        '<2sIHHI IiiHHIIiiII',
        b'BM',             # Signature
        file_size,         # File size
        0, 0,              # Reserved
        54,                # Data offset
        40,                # Header size
        width, height,     # Width and height
        1,                 # Planes
        24,                # Bits per pixel (24)
        0,                 # Compression (0 = none)
        width * height * 3, # Image size
        2835, 2835,        # Resolution
        0, 0               # Colors
    )
    with open(path, 'wb') as f:
        f.write(header)
        for y in reversed(range(height)):
            for x in range(width):
                val = int(img_data[y * width + x])
                f.write(bytes([val, val, val]))

# 1. Generate Synthetic dataset
def generate_shape_image(shape_type, shift_y=0, shift_x=0, noise_level=10):
    img = np.zeros((28, 28), dtype=np.uint8)
    
    # Draw horizontal line
    if shape_type == 0 or shape_type == 2:
        img[13 + shift_y : 15 + shift_y, :] = 255
    # Draw vertical line
    if shape_type == 1 or shape_type == 2:
        img[:, 13 + shift_x : 15 + shift_x] = 255
        
    # Add noise
    noise = np.random.randint(0, noise_level + 1, size=(28, 28))
    img = np.clip(img.astype(int) + noise - noise_level // 2, 0, 255).astype(np.uint8)
    return img

np.random.seed(42) # For reproducibility
X = []
Y = []
images = []
for shape in [0, 1, 2]:
    for i in range(10):
        shift_y = np.random.randint(-2, 3)
        shift_x = np.random.randint(-2, 3)
        img = generate_shape_image(shape, shift_y, shift_x)
        images.append(img)
        X.append(img.flatten() / 255.0)
        Y.append(shape)

X = np.array(X)
Y = np.array(Y)

# 2. Train a 784 -> 3 Logistic Regression model
W = np.zeros((784, 3))
b = np.zeros(3)
lr = 0.5
epochs = 500

for epoch in range(epochs):
    logits = np.dot(X, W) + b
    exp_logits = np.exp(logits - np.max(logits, axis=1, keepdims=True))
    probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
    
    loss = -np.mean(np.log(probs[np.arange(len(Y)), Y] + 1e-15))
    
    dlogits = probs.copy()
    dlogits[np.arange(len(Y)), Y] -= 1.0
    dlogits /= len(Y)
    
    dW = np.dot(X.T, dlogits)
    db = np.sum(dlogits, axis=0)
    
    W -= lr * dW
    b -= lr * db

# Evaluate final training accuracy
logits = np.dot(X, W) + b
preds = np.argmax(logits, axis=1)
acc = np.mean(preds == Y)
print(f"Model trained. Accuracy on clean images: {acc * 100:.2f}%")

# Save model weights to JSON
model_weights = {
    "W": W.tolist(),
    "b": b.tolist()
}
weights_path = os.path.join(BTC_DIR, "model_weights.json")
with open(weights_path, "w", encoding="utf-8") as f:
    json.dump(model_weights, f, indent=2)
print(f"Saved weights to {weights_path}")

# Write inputs.zip containing clean BMP images
temp_img_dir = os.path.join(BASE_DIR, "temp_clean_images")
os.makedirs(temp_img_dir, exist_ok=True)

clean_filenames = []
for idx, img in enumerate(images):
    filename = f"img_{idx:02d}.bmp"
    clean_filenames.append(filename)
    save_bmp(os.path.join(temp_img_dir, filename), img.flatten())

inputs_zip_path = os.path.join(BTC_DIR, "inputs.zip")
with zipfile.ZipFile(inputs_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    for filename in clean_filenames:
        zipf.write(os.path.join(temp_img_dir, filename), filename)
    # Also write model_weights.json inside the inputs zip
    weights_temp_path = os.path.join(temp_img_dir, "model_weights.json")
    with open(weights_temp_path, "w", encoding="utf-8") as f:
        json.dump(model_weights, f, indent=2)
    zipf.write(weights_temp_path, "model_weights.json")
print(f"Saved inputs to {inputs_zip_path}")

# Write ground_truth.csv
gt_path = os.path.join(BTC_DIR, "ground_truth.csv")
with open(gt_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["filename", "label"])
    for filename, label in zip(clean_filenames, Y):
        writer.writerow([filename, int(label)])
print(f"Saved ground truth to {gt_path}")

# 3. Create judge.py in btc_upload
judge_code = """import argparse
import csv
import json
import os
import struct
import zipfile
import tempfile
import shutil

def read_bmp(path):
    with open(path, 'rb') as f:
        header = f.read(54)
        if len(header) < 54 or header[:2] != b'BM':
            raise ValueError(f"Not a valid BMP file: {path}")
        width, height = struct.unpack('<ii', header[18:26])
        if width != 28 or height != 28:
            raise ValueError(f"Image must be 28x28, got {width}x{height}")
        pixels = [0] * 784
        for y in reversed(range(height)):
            for x in range(width):
                bgr = f.read(3)
                if len(bgr) < 3:
                    raise ValueError(f"Unexpected EOF in BMP pixel data of {path}")
                val = sum(bgr) // 3
                pixels[y * width + x] = val
        return pixels

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-dir", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--context", required=True)
    args = parser.parse_args()

    # Load ground truth labels
    gt_path = os.path.join(args.assets_dir, "ground_truth.csv")
    gt_labels = {}
    with open(gt_path, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader) # skip header
        for row in reader:
            if len(row) >= 2:
                gt_labels[row[0]] = int(row[1])

    # Load target model weights
    weights_path = os.path.join(args.assets_dir, "model_weights.json")
    inputs_zip = os.path.join(args.assets_dir, "inputs.zip")
    if os.path.exists(weights_path):
        with open(weights_path, 'r', encoding='utf-8') as f:
            model = json.load(f)
    else:
        with zipfile.ZipFile(inputs_zip, 'r') as zf:
            if "model_weights.json" in zf.namelist():
                with zf.open("model_weights.json") as fh:
                    model = json.load(fh)
            else:
                raise FileNotFoundError("model_weights.json not found in assets_dir or inputs.zip")
    W = model["W"]
    b = model["b"]

    # Load original clean images
    original_images = {}
    with zipfile.ZipFile(inputs_zip, 'r') as zf:
        for name in gt_labels.keys():
            try:
                with zf.open(name) as img_file:
                    with tempfile.NamedTemporaryFile(delete=False) as tmp:
                        tmp.write(img_file.read())
                        tmp_path = tmp.name
                    original_images[name] = read_bmp(tmp_path)
                    os.remove(tmp_path)
            except Exception as e:
                print(json.dumps({"status": "failed", "message": f"Could not load clean image {name}: {str(e)}"}))
                return

    # Determine prediction directory (extract zip if contestant uploaded a zip for non-final)
    temp_extract_dir = None
    zip_files = [f for f in os.listdir(args.submission_dir) if f.endswith(".zip")]
    if zip_files:
        temp_extract_dir = tempfile.mkdtemp()
        zip_path = os.path.join(args.submission_dir, zip_files[0])
        try:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                zf.extractall(temp_extract_dir)
            pred_dir = temp_extract_dir
        except Exception as e:
            print(json.dumps({"status": "failed", "message": f"Failed to extract submission zip: {str(e)}"}))
            if temp_extract_dir:
                shutil.rmtree(temp_extract_dir)
            return
    else:
        pred_dir = args.submission_dir

    epsilon = 96
    successful_attacks = 0
    total = len(gt_labels)
    constraint_failed = 0
    model_not_fooled = 0
    missing_images = 0

    for filename, true_label in gt_labels.items():
        adv_path = os.path.join(pred_dir, filename)
        if not os.path.exists(adv_path):
            missing_images += 1
            continue

        try:
            clean_pixels = original_images[filename]
            adv_pixels = read_bmp(adv_path)
        except Exception:
            constraint_failed += 1
            continue

        # Check L-infinity constraint
        li_norm = 0
        for i in range(784):
            diff = abs(adv_pixels[i] - clean_pixels[i])
            if diff > li_norm:
                li_norm = diff

        if li_norm > epsilon:
            constraint_failed += 1
            continue

        # Inference on adversarial image
        x = [v / 255.0 for v in adv_pixels]
        logits = [0.0, 0.0, 0.0]
        for c in range(3):
            val = b[c]
            for i in range(784):
                val += x[i] * W[i][c]
            logits[c] = val
        
        pred = logits.index(max(logits))

        if pred != true_label:
            successful_attacks += 1
        else:
            model_not_fooled += 1

    if temp_extract_dir:
        shutil.rmtree(temp_extract_dir)

    success_rate = successful_attacks / total if total > 0 else 0.0

    print(json.dumps({
        "status": "success",
        "raw_score": success_rate,
        "display_score": success_rate * 100.0,
        "message": f"Evaluation complete. Attack success rate: {success_rate * 100.0:.2f}%",
        "payload": {
            "total": total,
            "successful_attacks": successful_attacks,
            "constraint_failed": constraint_failed,
            "model_not_fooled": model_not_fooled,
            "missing_images": missing_images,
            "epsilon_limit": epsilon
        }
    }))

if __name__ == "__main__":
    main()
"""
judge_path = os.path.join(BTC_DIR, "judge.py")
with open(judge_path, "w", encoding="utf-8") as f:
    f.write(judge_code)
print(f"Saved judge script to {judge_path}")

# 4. Generate perfect and poor perturbed images (for direct zip upload test)
temp_perfect_dir = os.path.join(BASE_DIR, "temp_perfect_images")
temp_poor_dir = os.path.join(BASE_DIR, "temp_poor_images")
os.makedirs(temp_perfect_dir, exist_ok=True)
os.makedirs(temp_poor_dir, exist_ok=True)

# Generate perfect attack (using FGSM sign(W_c_true))
epsilon = 96
for idx, (img, label) in enumerate(zip(images, Y)):
    filename = f"img_{idx:02d}.bmp"
    # FGSM update: to reduce P(label), we move opposite to weight vector W[:, label]
    # pixel = pixel - epsilon * sign(W[:, label])
    # Clip to [0, 255]
    grad_sign = np.sign(W[:, label])
    adv_img = img.flatten().astype(float) - epsilon * grad_sign
    adv_img = np.clip(adv_img, 0, 255).astype(np.uint8)
    
    save_bmp(os.path.join(temp_perfect_dir, filename), adv_img)
    # Poor attack is just the clean image (no perturbation)
    save_bmp(os.path.join(temp_poor_dir, filename), img.flatten())

# Create perfect_adversarial_images.zip
perfect_zip_path = os.path.join(CONTESTANT_DIR, "perfect_adversarial_images.zip")
with zipfile.ZipFile(perfect_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    for filename in clean_filenames:
        zipf.write(os.path.join(temp_perfect_dir, filename), filename)
print(f"Created perfect ZIP submission: {perfect_zip_path}")

# Create poor_adversarial_images.zip
poor_zip_path = os.path.join(CONTESTANT_DIR, "poor_adversarial_images.zip")
with zipfile.ZipFile(poor_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    for filename in clean_filenames:
        zipf.write(os.path.join(temp_poor_dir, filename), filename)
print(f"Created poor ZIP submission: {poor_zip_path}")

# 5. Generate contestant infer.py code files
infer_perfect_code = """import argparse
import json
import os
import struct
import zipfile

def read_bmp(path):
    with open(path, 'rb') as f:
        header = f.read(54)
        if len(header) < 54 or header[:2] != b'BM':
            raise ValueError(f"Not a valid BMP file: {path}")
        width, height = struct.unpack('<ii', header[18:26])
        if width != 28 or height != 28:
            raise ValueError(f"Image must be 28x28, got {width}x{height}")
        pixels = [0] * 784
        for y in reversed(range(height)):
            for x in range(width):
                bgr = f.read(3)
                if len(bgr) < 3:
                    raise ValueError(f"Unexpected EOF in BMP pixel data of {path}")
                val = sum(bgr) // 3
                pixels[y * width + x] = val
        return pixels

def save_bmp(path, img_data):
    width, height = 28, 28
    file_size = 54 + width * height * 3
    header = struct.pack(
        '<2sIHHI IiiHHIIiiII',
        b'BM',             # Signature
        file_size,         # File size
        0, 0,              # Reserved
        54,                # Data offset
        40,                # Header size
        width, height,     # Width and height
        1,                 # Planes
        24,                # Bits per pixel (24)
        0,                 # Compression (0 = none)
        width * height * 3, # Image size
        2835, 2835,        # Resolution
        0, 0               # Colors
    )
    with open(path, 'wb') as f:
        f.write(header)
        for y in reversed(range(height)):
            for x in range(width):
                val = int(img_data[y * width + x])
                f.write(bytes([val, val, val]))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-dir", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--context", required=True)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # 1. Load target model weights
    weights_path = os.path.join(args.assets_dir, "model_weights.json")
    inputs_zip = os.path.join(args.assets_dir, "inputs.zip")
    if os.path.exists(weights_path):
        with open(weights_path, 'r', encoding='utf-8') as f:
            model = json.load(f)
    else:
        with zipfile.ZipFile(inputs_zip, 'r') as zf:
            if "model_weights.json" in zf.namelist():
                with zf.open("model_weights.json") as fh:
                    model = json.load(fh)
            else:
                raise FileNotFoundError("model_weights.json not found in assets_dir or inputs.zip")
    W = model["W"]
    b = model["b"]

    # 2. Extract inputs.zip containing clean images
    temp_extract = os.path.join(args.output_dir, "temp_inputs")
    os.makedirs(temp_extract, exist_ok=True)
    with zipfile.ZipFile(inputs_zip, 'r') as zf:
        zf.extractall(temp_extract)

    # 3. Perform attack on each BMP file and save to output-dir
    epsilon = 96
    for filename in os.listdir(temp_extract):
        if not filename.endswith(".bmp"):
            continue
        
        path = os.path.join(temp_extract, filename)
        pixels = read_bmp(path)

        # Get initial model prediction to target it
        x = [v / 255.0 for v in pixels]
        logits = [0.0, 0.0, 0.0]
        for c in range(3):
            val = b[c]
            for i in range(784):
                val += x[i] * W[i][c]
            logits[c] = val
        pred = logits.index(max(logits))

        # FGSM to decrease prediction of original class
        # pixel = pixel - epsilon * sign(W[:, pred])
        adv_pixels = [0] * 784
        for i in range(784):
            w_val = W[i][pred]
            grad_sign = 1 if w_val > 0 else (-1 if w_val < 0 else 0)
            val = int(pixels[i] - epsilon * grad_sign)
            if val < 0: val = 0
            if val > 255: val = 255
            adv_pixels[i] = val

        out_path = os.path.join(args.output_dir, filename)
        save_bmp(out_path, adv_pixels)

    print("Inference completed successfully.")

if __name__ == "__main__":
    main()
"""

infer_poor_code = """import argparse
import os
import shutil
import zipfile

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-dir", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--context", required=True)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # Poor contestant code: just extract clean images directly to the output directory
    # (no perturbation, fails to attack)
    inputs_zip = os.path.join(args.assets_dir, "inputs.zip")
    with zipfile.ZipFile(inputs_zip, 'r') as zf:
        zf.extractall(args.output_dir)

    print("Inference completed successfully.")

if __name__ == "__main__":
    main()
"""

# Write code to temp files
temp_infer_perfect = os.path.join(CONTESTANT_DIR, "infer_perfect.py")
with open(temp_infer_perfect, "w", encoding="utf-8") as f:
    f.write(infer_perfect_code)

temp_infer_poor = os.path.join(CONTESTANT_DIR, "infer_poor.py")
with open(temp_infer_poor, "w", encoding="utf-8") as f:
    f.write(infer_poor_code)

# Create submission_perfect.zip
submission_perfect_zip = os.path.join(CONTESTANT_DIR, "submission_perfect.zip")
with zipfile.ZipFile(submission_perfect_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
    zipf.write(temp_infer_perfect, "infer.py")
print(f"Created submission_perfect.zip: {submission_perfect_zip}")

# Create submission_poor.zip
submission_poor_zip = os.path.join(CONTESTANT_DIR, "submission_poor.zip")
with zipfile.ZipFile(submission_poor_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
    zipf.write(temp_infer_poor, "infer.py")
print(f"Created submission_poor.zip: {submission_poor_zip}")

# Clean up temp directories and files
shutil.rmtree(temp_img_dir)
shutil.rmtree(temp_perfect_dir)
shutil.rmtree(temp_poor_dir)
os.remove(temp_infer_perfect)
os.remove(temp_infer_poor)

print("\nAll Adversarial Image attack dataset files generated successfully!")
