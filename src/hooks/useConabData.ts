import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAllConabData,
  fetchFilteredData,
  fetchDataByState,
  fetchAvailableYears,
  fetchAvailableStates,
  upsertConabData,
} from '@/api/supabase';
import { ConabData } from '@/lib/index';

// ============================================================
// CHAVES DE CACHE DO REACT QUERY
// ============================================================
export const QUERY_KEYS = {
  allData: ['conab', 'all'] as const,
  filtered: (filters: object) => ['conab', 'filtered', filters] as const,
  byState: (state: string) => ['conab', 'state', state] as const,
  years: ['conab', 'years'] as const,
  states: ['conab', 'states'] as const,
};

// ============================================================
// HOOKS DE LEITURA
// ============================================================

/** Hook principal: busca todos os dados históricos da CONAB */
export const useAllConabData = () =>
  useQuery({
    queryKey: QUERY_KEYS.allData,
    queryFn: fetchAllConabData,
    staleTime: 1000 * 60 * 10, // 10 minutos
  });

/** Hook para dados filtrados por anos, estados e culturas */
export const useFilteredConabData = (filters: {
  years?: number[];
  states?: string[];
  crops?: string[];
}) =>
  useQuery({
    queryKey: QUERY_KEYS.filtered(filters),
    queryFn: () => fetchFilteredData(filters),
    staleTime: 1000 * 60 * 5,
  });

/** Hook para dados de um estado específico */
export const useStateConabData = (state: string) =>
  useQuery({
    queryKey: QUERY_KEYS.byState(state),
    queryFn: () => fetchDataByState(state),
    enabled: !!state,
    staleTime: 1000 * 60 * 10,
  });

/** Hook para lista de anos disponíveis */
export const useAvailableYears = () =>
  useQuery({
    queryKey: QUERY_KEYS.years,
    queryFn: fetchAvailableYears,
    staleTime: 1000 * 60 * 30,
  });

/** Hook para lista de estados disponíveis */
export const useAvailableStates = () =>
  useQuery({
    queryKey: QUERY_KEYS.states,
    queryFn: fetchAvailableStates,
    staleTime: 1000 * 60 * 30,
  });

// ============================================================
// HOOKS DE ESCRITA
// ============================================================

/** Hook para sincronizar dados (upsert em lote) */
export const useSyncConabData = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (records: ConabData[]) => upsertConabData(records),
    onSuccess: () => {
      // Invalida todo o cache ao sincronizar
      queryClient.invalidateQueries({ queryKey: ['conab'] });
    },
  });
};
