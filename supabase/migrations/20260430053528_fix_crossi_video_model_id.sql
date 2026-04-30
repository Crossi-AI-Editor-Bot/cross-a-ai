-- Fix model id to use Puter's correct model identifier (google/imagen-4.0-fast)
UPDATE model_costs
SET model_id = 'crossi-video/google/imagen-4.0-fast'
WHERE id = 'e1b62dd2-0b09-468e-b6e3-61de9aae5af5';
