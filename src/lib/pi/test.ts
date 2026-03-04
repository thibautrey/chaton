// src/lib/pi/test.ts
// Test simple pour vérifier que les modules Pi s'importent correctement

import { isPiInstalled, loadPiConfig } from './pi-integration';
import { initPiManager, getModels, getSettings } from './pi-manager';

async function testPiIntegration() {
  console.log('Test de l\'intégration Pi...');

  // Test 1: Vérifier si Pi est installé
  console.log('Test 1: Vérification de l\'installation de Pi');
  const isInstalled = isPiInstalled();
  console.log(`  Pi est installé: ${isInstalled}`);

  // Test 2: Charger la configuration
  console.log('Test 2: Chargement de la configuration');
  const configPath = loadPiConfig();
  console.log(`  Chemin de configuration: ${configPath}`);

  // Test 3: Initialiser Pi Manager
  console.log('Test 3: Initialisation de Pi Manager');
  try {
    await initPiManager();
    console.log('  Pi Manager initialisé avec succès');

    // Test 4: Récupérer les modèles
    console.log('Test 4: Récupération des modèles');
    const models = getModels();
    console.log(`  Nombre de modèles: ${models.length}`);
    if (models.length > 0) {
      console.log('  Premier modèle:', models[0]);
    }

    // Test 5: Récupérer les paramètres
    console.log('Test 5: Récupération des paramètres');
    const settings = getSettings();
    console.log(`  Modèles activés: ${settings.enabledModels.length}`);
    console.log(`  Modèle par défaut: ${settings.defaultModel || 'non défini'}`);

    console.log('\nTous les tests ont réussi !');
  } catch (error) {
    console.error('Erreur lors des tests:', error);
  }
}

// Exécuter les tests si ce fichier est exécuté directement
testPiIntegration().catch(console.error);
