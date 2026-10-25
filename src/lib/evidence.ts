import { supabase } from './supabaseClient';
import type { EvidenceConfidence, EvidenceFile } from '../types/database';

export async function uploadEvidence(params: {
  businessId: string;
  relatedTable: string;
  relatedId: string;
  file: File;
  description?: string;
  confidence: EvidenceConfidence;
  observedDate?: string;
}): Promise<{ data: EvidenceFile | null; error: string | null }> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { data: null, error: 'Not signed in.' };

  const safeName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userData.user.id}/${params.businessId}/${params.relatedTable}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from('evidence').upload(storagePath, params.file);
  if (uploadError) return { data: null, error: uploadError.message };

  const { data, error } = await supabase
    .from('evidence_files')
    .insert({
      business_id: params.businessId,
      related_table: params.relatedTable,
      related_id: params.relatedId,
      storage_path: storagePath,
      file_name: params.file.name,
      file_type: params.file.type,
      description: params.description ?? null,
      evidence_confidence: params.confidence,
      observed_date: params.observedDate ?? null
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as EvidenceFile, error: null };
}

export async function listEvidence(relatedTable: string, relatedId: string): Promise<EvidenceFile[]> {
  const { data, error } = await supabase
    .from('evidence_files')
    .select('*')
    .eq('related_table', relatedTable)
    .eq('related_id', relatedId)
    .order('uploaded_at', { ascending: false });
  if (error) {
    console.error('listEvidence failed:', error.message);
    return [];
  }
  return data as EvidenceFile[];
}

export async function getEvidenceSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('evidence').createSignedUrl(storagePath, 60 * 10);
  if (error) {
    console.error('getEvidenceSignedUrl failed:', error.message);
    return null;
  }
  return data.signedUrl;
}
