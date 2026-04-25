#!/usr/bin/env python3
"""
ML Server for DMAESTRO
Exposes REST API for audio transcription using Demucs + MR-MT3

Usage:
    python server.py [--port 5000] [--host 0.0.0.0]

Endpoints:
    POST /transcribe - Upload audio file, returns notes JSON
    GET  /health     - Health check
    GET  /status     - Server status and capabilities
"""

import os
import sys
import json
import tempfile
import traceback
from pathlib import Path
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

from transcribe import process_audio

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from DMAESTRO frontend

# Configuration
ALLOWED_EXTENSIONS = {'mp3', 'wav', 'flac', 'm4a', 'ogg', 'webm'}
MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB max file size
MT3_DIR = os.environ.get('MT3_DIR', './MR-MT3')

app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Track processing status
processing_jobs = {}


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})


@app.route('/status', methods=['GET'])
def status():
    """Server status and capabilities"""
    # Check if MR-MT3 is available
    mt3_available = os.path.exists(os.path.join(MT3_DIR, 'inference.py'))

    # Check if Demucs is available
    try:
        import demucs
        demucs_available = True
        demucs_version = getattr(demucs, '__version__', 'unknown')
    except ImportError:
        demucs_available = False
        demucs_version = None

    # Check GPU availability
    try:
        import torch
        gpu_available = torch.cuda.is_available()
        gpu_name = torch.cuda.get_device_name(0) if gpu_available else None
    except:
        gpu_available = False
        gpu_name = None

    return jsonify({
        'status': 'running',
        'version': '1.0.0',
        'capabilities': {
            'stemSeparation': demucs_available,
            'transcription': mt3_available,
            'gpu': gpu_available,
        },
        'details': {
            'demucsVersion': demucs_version,
            'mt3Dir': MT3_DIR,
            'gpuName': gpu_name,
            'maxFileSize': MAX_CONTENT_LENGTH,
            'allowedFormats': list(ALLOWED_EXTENSIONS),
        },
        'activeJobs': len([j for j in processing_jobs.values() if j['status'] == 'processing']),
    })


@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Transcribe audio file to notes

    Request:
        - Form data with 'audio' file
        - Optional 'separate' boolean (default: true)
        - Optional 'jobId' string for tracking

    Response:
        {
            "success": true,
            "notes": [...],
            "noteCount": 123,
            "duration": 180.5,
            "processingTime": 45.2
        }
    """
    start_time = datetime.utcnow()
    job_id = request.form.get('jobId', datetime.utcnow().isoformat())

    try:
        # Validate file upload
        if 'audio' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400

        file = request.files['audio']

        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': f'Invalid file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400

        # Parse options
        separate = request.form.get('separate', 'true').lower() != 'false'

        # Save uploaded file to temp location
        filename = secure_filename(file.filename)

        with tempfile.TemporaryDirectory() as tmp_dir:
            audio_path = os.path.join(tmp_dir, filename)
            file.save(audio_path)

            print(f"[Server] Processing: {filename} (separate={separate})", file=sys.stderr)

            # Update job status
            processing_jobs[job_id] = {
                'status': 'processing',
                'filename': filename,
                'startTime': start_time.isoformat(),
            }

            # Run transcription pipeline
            result = process_audio(
                audio_path,
                separate=separate,
                mt3_dir=MT3_DIR
            )

            # Calculate processing time
            end_time = datetime.utcnow()
            processing_time = (end_time - start_time).total_seconds()

            # Update job status
            processing_jobs[job_id] = {
                'status': 'completed',
                'filename': filename,
                'startTime': start_time.isoformat(),
                'endTime': end_time.isoformat(),
                'processingTime': processing_time,
                'noteCount': result['noteCount'],
            }

            return jsonify({
                'success': True,
                'jobId': job_id,
                'notes': result['notes'],
                'noteCount': result['noteCount'],
                'duration': result['duration'],
                'notesDuration': result['notesDuration'],
                'stemsSeparated': result['stemsSeparated'],
                'processingTime': round(processing_time, 2),
            })

    except Exception as e:
        # Log error
        error_msg = str(e)
        traceback.print_exc()

        # Update job status
        processing_jobs[job_id] = {
            'status': 'failed',
            'error': error_msg,
            'startTime': start_time.isoformat(),
        }

        return jsonify({
            'success': False,
            'jobId': job_id,
            'error': error_msg,
        }), 500


@app.route('/jobs/<job_id>', methods=['GET'])
def get_job(job_id: str):
    """Get status of a processing job"""
    if job_id not in processing_jobs:
        return jsonify({'success': False, 'error': 'Job not found'}), 404

    return jsonify({
        'success': True,
        'job': processing_jobs[job_id],
    })


@app.route('/transcribe-url', methods=['POST'])
def transcribe_url():
    """
    Transcribe audio from URL (alternative to file upload)

    Request JSON:
        {
            "url": "https://example.com/audio.mp3",
            "separate": true
        }
    """
    try:
        import requests as req_lib

        data = request.get_json()

        if not data or 'url' not in data:
            return jsonify({'success': False, 'error': 'No URL provided'}), 400

        url = data['url']
        separate = data.get('separate', True)

        # Download file
        with tempfile.TemporaryDirectory() as tmp_dir:
            # Extract filename from URL
            filename = url.split('/')[-1].split('?')[0]
            if not allowed_file(filename):
                filename = 'audio.mp3'

            audio_path = os.path.join(tmp_dir, filename)

            print(f"[Server] Downloading: {url}", file=sys.stderr)
            response = req_lib.get(url, timeout=60)
            response.raise_for_status()

            with open(audio_path, 'wb') as f:
                f.write(response.content)

            print(f"[Server] Processing downloaded file: {filename}", file=sys.stderr)

            result = process_audio(
                audio_path,
                separate=separate,
                mt3_dir=MT3_DIR
            )

            return jsonify({
                'success': True,
                'notes': result['notes'],
                'noteCount': result['noteCount'],
                'duration': result['duration'],
            })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


def main():
    import argparse

    parser = argparse.ArgumentParser(description='DMAESTRO ML Server')
    parser.add_argument('--port', type=int, default=5000, help='Port to run server on')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind to')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')

    args = parser.parse_args()

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║                    DMAESTRO ML Server                        ║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                  ║
║    POST /transcribe  - Upload audio, get notes               ║
║    GET  /health      - Health check                          ║
║    GET  /status      - Server capabilities                   ║
╠══════════════════════════════════════════════════════════════╣
║  Server: http://{args.host}:{args.port}                          ║
╚══════════════════════════════════════════════════════════════╝
    """)

    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == '__main__':
    main()
