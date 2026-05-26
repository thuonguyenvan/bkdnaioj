import argparse
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
