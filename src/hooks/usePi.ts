// src/hooks/usePi.ts
// Hook React pour utiliser Pi dans les composants

import { useState, useEffect } from 'react';
import { PiModel, PiSettings } from '../types/pi-types';

export function usePi() {
  const [models, setModels] = useState<PiModel[]>([]);
  const [settings, setSettings] = useState<PiSettings>({ enabledModels: [] });
  const [isUsingUserConfig, setIsUsingUserConfig] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Récupère les modèles disponibles
  const fetchModels = async () => {
    try {
      const result = await window.pi.getModels();
      setModels(result);
    } catch (err) {
      console.error('Erreur lors de la récupération des modèles:', err);
      setError('Erreur lors de la récupération des modèles');
    }
  };

  // Récupère les paramètres de l'utilisateur
  const fetchSettings = async () => {
    try {
      const result = await window.pi.getSettings();
      setSettings(result);
    } catch (err) {
      console.error('Erreur lors de la récupération des paramètres:', err);
      setError('Erreur lors de la récupération des paramètres');
    }
  };

  // Vérifie si la configuration de l'utilisateur est utilisée
  const checkUserConfig = async () => {
    try {
      const result = await window.pi.isUsingUserConfig();
      setIsUsingUserConfig(result);
    } catch (err) {
      console.error('Erreur lors de la vérification de la configuration:', err);
      setError('Erreur lors de la vérification de la configuration');
    }
  };

  // Met à jour les paramètres de l'utilisateur
  const updateSettings = async (newSettings: Partial<PiSettings>) => {
    try {
      const result = await window.pi.updateSettings(newSettings);
      setSettings(result);
      return result;
    } catch (err) {
      console.error('Erreur lors de la mise à jour des paramètres:', err);
      setError('Erreur lors de la mise à jour des paramètres');
      return settings;
    }
  };

  // Charge les données au montage du composant
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchModels(), fetchSettings(), checkUserConfig()]);
      } catch (err) {
        console.error('Erreur lors du chargement des données Pi:', err);
        setError('Erreur lors du chargement des données Pi');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return {
    models,
    settings,
    isUsingUserConfig,
    loading,
    error,
    updateSettings,
    refresh: () => {
      fetchModels();
      fetchSettings();
      checkUserConfig();
    }
  };
}
