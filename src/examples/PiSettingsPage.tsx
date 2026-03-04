// src/examples/PiSettingsPage.tsx
// Exemple de page pour afficher les paramètres de Pi

import React from 'react';
import { PiSettings } from '../components/PiSettings';

export const PiSettingsPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Configuration de Pi</h1>
      
      <div className="max-w-4xl">
        <PiSettings />
      </div>
      
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">À propos de cette intégration</h2>
        <p className="text-gray-700 mb-2">
          Cette page montre comment Pi Coding Agent est intégré dans l'application.
        </p>
        <p className="text-gray-700 mb-2">
          Si vous avez déjà Pi installé sur votre machine, l'application 
          utilisera automatiquement votre configuration existante.
        </p>
        <p className="text-gray-700">
          Sinon, une configuration locale embarquée sera utilisée
          de l'application.
        </p>
      </div>
    </div>
  );
};
