-- Appointment reminder tables
-- Run once against the client's database before activating the n8n workflow.
-- The n8n Postgres credential must connect to this same database.

-- Appointments table — source of truth for scheduled visits.
-- clientPhone must be in E.164 format without the leading + (e.g. 201234567890).
CREATE TABLE IF NOT EXISTS appointments (
    id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_name  TEXT        NOT NULL,
    client_phone TEXT        NOT NULL,   -- E.164, no leading +: 201234567890
    scheduled_at TIMESTAMPTZ NOT NULL,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments (scheduled_at);

-- Reminder log — tracks every sent (or failed) reminder to prevent duplicates.
-- reminder_type: '24h' or '1h'
-- status:        'sent' | 'failed'
CREATE TABLE IF NOT EXISTS reminder_log (
    id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    appointment_id TEXT        NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    reminder_type  TEXT        NOT NULL CHECK (reminder_type IN ('24h', '1h')),
    status         TEXT        NOT NULL CHECK (status IN ('sent', 'failed')),
    error_message  TEXT,
    sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One attempt per appointment per reminder window.
    -- A 'failed' row is overwritten if the workflow retries after manual reset.
    UNIQUE (appointment_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_appointment ON reminder_log (appointment_id);

-- ── Test seed row (remove before going to production) ────────────────────────
-- Creates an appointment 24 h 10 min from now so the workflow fires on its
-- next run and sends a real WhatsApp message to the number below.
INSERT INTO appointments (client_name, client_phone, scheduled_at, notes)
VALUES (
    'Test Client',
    '201234567890',    -- replace with your own number
    NOW() + INTERVAL '24 hours 10 minutes',
    'Smoke-test appointment — delete after verifying the reminder arrives'
)
ON CONFLICT DO NOTHING;
