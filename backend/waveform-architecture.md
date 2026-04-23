# Waveform Architecture

## Overview
The Waveform module is responsible for generating, storing, and serving normalized peak-amplitude data for audio tracks. This data is used by the frontend to render visual waveforms.

## Components

### 1. WaveformGeneratorService
- **Purpose**: Low-level utility that interfaces with the `audiowaveform` CLI.
- **Implementation**: Shells out to `audiowaveform` to extract peak data from audio files.
- **Output**: Returns a normalized array of numbers (0.0 to 1.0) and the peak amplitude.

### 2. WaveformService
- **Purpose**: High-level domain logic for waveform management.
- **Responsibilities**:
    - Orchestrating generation via BullMQ jobs.
    - Persisting results to the database.
    - Providing status and data to the API.
- **Retry Logic**: Leverages BullMQ's exponential back-off for durable retries.

### 3. WaveformProcessor (Worker)
- **Purpose**: BullMQ worker host that processes background jobs.
- **Workflow**:
    1. Picks up a `GENERATE` job from the queue.
    2. Marks the record as `PROCESSING` in the DB.
    3. Calls `WaveformGeneratorService` to process the file.
    4. On success: Persists data and marks as `COMPLETED`.
    5. On failure: Logs the error and re-throws for BullMQ retry, or marks as `FAILED` if attempts are exhausted.

### 4. WaveformController
- **Endpoint**: `/api/v1/tracks/:trackId/waveform`
- **Methods**:
    - `GET /`: Retrieve waveform data and status.
    - `POST /regenerate`: Trigger a new generation job.

## Data Model (TrackWaveform Entity)
- `trackId`: Unique identifier linked to the Track entity.
- `waveformData`: JSON array of normalized peaks.
- `generationStatus`: `pending`, `processing`, `completed`, or `failed`.
- `peakAmplitude`: The highest raw amplitude detected.
- `attemptCount`: Number of processing attempts made.
- `failReason`: Text description of the last error (if failed).
- `bullJobId`: Correlation ID for the BullMQ job.

## Implementation Details
- **CLI Tool**: Requires `audiowaveform` to be installed on the host/container.
- **Queue**: Uses BullMQ with Redis for job persistence and concurrency control.
- **Storage**: Normalised data is stored in PostgreSQL as `jsonb` for efficient retrieval.
