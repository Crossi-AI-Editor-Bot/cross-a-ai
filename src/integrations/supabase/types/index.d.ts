// Temporary ambient types for Lovable Cloud client until generated types are available.
// This file is safe to keep; it will be superseded if real types are generated.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {}
