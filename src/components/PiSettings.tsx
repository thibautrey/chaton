// src/components/PiSettings.tsx
// Composant pour afficher et configurer les paramètres de Pi

import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePi } from '../hooks/usePi';
import type { PiModel } from '../types/pi-types';

export const PiSettings: React.FC = () => {
  const { t } = useTranslation();
  const { models, settings, isUsingUserConfig, loading, error, updateSettings } = usePi();

  const handleModelToggle = async (modelId: string) => {
    const isEnabled = settings.enabledModels.includes(modelId);
    const newEnabledModels = isEnabled
      ? settings.enabledModels.filter((id: string) => id !== modelId)
      : [...settings.enabledModels, modelId];

    await updateSettings({ enabledModels: newEnabledModels });
  };

  if (loading) {
    return <div className="p-4 bg-gray-100 rounded-lg">{t('Chargement des paramètres Pi...')}</div>;
  }

  if (error) {
    return <div className="p-4 bg-red-100 text-red-700 rounded-lg">{t('Erreur: {{error}}', { error })}</div>;
  }

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h2 className="text-xl font-bold mb-4">{t('Paramètres Pi')}</h2>

      <div className="mb-4">
        <p className="text-sm text-gray-600">
          {isUsingUserConfig 
            ? t('Utilisation de la configuration Pi de l\'utilisateur')
            : t('Utilisation de la configuration Pi locale embarquée')}
        </p>
      </div>

      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">{t('Modèles disponibles')}</h3>
        <p className="text-sm text-gray-600 mb-2">
          {t('{{count}} modèle(s) disponible(s)').replace('{{count}}', models.length.toString())}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
          {models.map((model: PiModel) => (
            <div key={model.id} className="p-2 border rounded-lg flex items-center justify-between">
              <div>
                <div className="font-medium">{model.name}</div>
                <div className="text-sm text-gray-500">{model.provider}</div>
                <div className="text-xs text-gray-400">{model.id}</div>
              </div>
              <button
                onClick={() => handleModelToggle(model.id)}
                className={`px-2 py-1 rounded text-xs ${
                  settings.enabledModels.includes(model.id)
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {settings.enabledModels.includes(model.id) ? t('Désactiver') : t('Activer')}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">{t('Modèles activés')}</h3>
        {settings.enabledModels.length === 0 ? (
          <p className="text-sm text-gray-500">{t('Aucun modèle activé')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {settings.enabledModels.map((modelId: string) => {
              const model = models.find(m => m.id === modelId);
              return (
                <div key={modelId} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                  {model ? model.name : modelId}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">{t('Paramètres supplémentaires')}</h3>
        <div className="space-y-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('Modèle par défaut')}</label>
            <select
              value={settings.defaultModel || ''}
              onChange={(e) => updateSettings({ defaultModel: e.target.value })}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="">{t('Sélectionnez un modèle par défaut')}</option>
              {models.map((model: PiModel) => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
