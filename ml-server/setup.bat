@echo off
REM DMAESTRO ML Server Setup Script for Windows
REM Run this script in the ml-server directory

echo ========================================
echo  DMAESTRO ML Server Setup (Windows)
echo ========================================
echo.

REM Check if conda is available
where conda >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Conda not found!
    echo Please install Miniconda from: https://docs.conda.io/en/latest/miniconda.html
    echo Then restart this script.
    pause
    exit /b 1
)

echo [1/6] Creating conda environment...
call conda create --name dmaestro-ml python=3.10 -y
if %ERRORLEVEL% NEQ 0 (
    echo Environment may already exist, continuing...
)

echo.
echo [2/6] Activating environment...
call conda activate dmaestro-ml

echo.
echo [3/6] Installing PyTorch...
echo Checking for NVIDIA GPU...

REM Try to detect GPU
nvidia-smi >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo GPU detected! Installing CUDA version...
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
) else (
    echo No GPU detected. Installing CPU version...
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
)

echo.
echo [4/6] Installing dependencies...
pip install -r requirements.txt

echo.
echo [5/6] Cloning MR-MT3 repository...
if exist "MR-MT3" (
    echo MR-MT3 already exists, pulling latest...
    cd MR-MT3
    git pull
    cd ..
) else (
    git clone https://github.com/gudgud96/MR-MT3.git
)

echo.
echo [6/6] Downloading pretrained model...
cd MR-MT3
if not exist "checkpoints" (
    echo Installing git-lfs...
    git lfs install
    echo Cloning model from HuggingFace (this may take a while)...
    git clone https://huggingface.co/gudgud1014/MR-MT3 checkpoints
) else (
    echo Checkpoints already exist, skipping download.
)
cd ..

echo.
echo ========================================
echo  Setup Complete!
echo ========================================
echo.
echo To start the server:
echo   1. Open a new terminal
echo   2. Run: conda activate dmaestro-ml
echo   3. Run: python server.py
echo.
echo Server will be available at: http://localhost:5000
echo.
echo To allow access from other machines, use:
echo   python server.py --host 0.0.0.0
echo.
pause
