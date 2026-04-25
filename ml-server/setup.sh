#!/bin/bash
# DMAESTRO ML Server Setup Script for Linux/Mac
# Run this script in the ml-server directory

set -e  # Exit on error

echo "========================================"
echo " DMAESTRO ML Server Setup (Linux/Mac)"
echo "========================================"
echo

# Check if conda is available
if ! command -v conda &> /dev/null; then
    echo "ERROR: Conda not found!"
    echo "Please install Miniconda from: https://docs.conda.io/en/latest/miniconda.html"
    echo "Then restart this script."
    exit 1
fi

echo "[1/6] Creating conda environment..."
conda create --name dmaestro-ml python=3.10 -y || echo "Environment may already exist, continuing..."

echo
echo "[2/6] Activating environment..."
source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate dmaestro-ml

echo
echo "[3/6] Installing PyTorch..."
echo "Checking for NVIDIA GPU..."

# Check for GPU
if command -v nvidia-smi &> /dev/null && nvidia-smi &> /dev/null; then
    echo "GPU detected! Installing CUDA version..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
else
    echo "No GPU detected. Installing CPU version..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
fi

echo
echo "[4/6] Installing dependencies..."
pip install -r requirements.txt

echo
echo "[5/6] Cloning MR-MT3 repository..."
if [ -d "MR-MT3" ]; then
    echo "MR-MT3 already exists, pulling latest..."
    cd MR-MT3
    git pull
    cd ..
else
    git clone https://github.com/gudgud96/MR-MT3.git
fi

echo
echo "[6/6] Downloading pretrained model..."
cd MR-MT3
if [ ! -d "checkpoints" ]; then
    echo "Installing git-lfs..."
    git lfs install
    echo "Cloning model from HuggingFace (this may take a while)..."
    git clone https://huggingface.co/gudgud1014/MR-MT3 checkpoints
else
    echo "Checkpoints already exist, skipping download."
fi
cd ..

echo
echo "========================================"
echo " Setup Complete!"
echo "========================================"
echo
echo "To start the server:"
echo "  1. Run: conda activate dmaestro-ml"
echo "  2. Run: python server.py"
echo
echo "Server will be available at: http://localhost:5000"
echo
echo "To allow access from other machines, use:"
echo "  python server.py --host 0.0.0.0"
echo
