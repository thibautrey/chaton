import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit2, Keyboard, X } from 'lucide-react';

import { useShortcuts } from '@/hooks/use-shortcuts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ShortcutsSection() {
  const { t } = useTranslation();
  const {
    getAllShortcuts,
    getAllActions,
    updateShortcut,
    saveConfigs
  } = useShortcuts();

  const [shortcuts, setShortcuts] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [editData, setEditData] = useState({
    accelerator: '',
    scope: 'foreground' as 'foreground' | 'global',
    enabled: true
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [shortcutsData, actionsData] = await Promise.all([
          getAllShortcuts(),
          getAllActions()
        ]);
        setShortcuts(shortcutsData);
        setActions(actionsData);
      } catch (error) {
        console.error('Failed to load shortcuts data:', error);
      }
    };

    loadData();
  }, [getAllShortcuts, getAllActions]);

  const handleEditClick = (shortcut: any) => {
    setEditingShortcut(shortcut.id);
    setEditData({
      accelerator: shortcut.accelerator,
      scope: shortcut.scope,
      enabled: shortcut.enabled
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingShortcut) return;

    try {
      await updateShortcut(editingShortcut, editData);
      await saveConfigs();
      
      // Refresh the data
      const updatedShortcuts = await getAllShortcuts();
      setShortcuts(updatedShortcuts);
      
      setIsDialogOpen(false);
      setEditingShortcut(null);
    } catch (error) {
      console.error('Failed to save shortcut:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.metaKey) keys.push('Cmd');
    if (e.shiftKey) keys.push('Shift');
    if (e.altKey) keys.push('Alt');
    
    if (e.key !== 'Control' && e.key !== 'Meta' && e.key !== 'Shift' && e.key !== 'Alt') {
      keys.push(e.key);
    }
    
    setRecordedKeys(keys);
    setEditData(prev => ({ ...prev, accelerator: keys.join('+') }));
    setIsRecording(false);
  };

  const startRecording = () => {
    setIsRecording(true);
    setRecordedKeys([]);
    setEditData(prev => ({ ...prev, accelerator: '' }));
  };

  const getActionName = (actionId: string) => {
    const action = actions.find(a => a.id === actionId);
    return action ? action.name : actionId;
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div className="settings-section-icon">
          <Keyboard className="h-5 w-5" />
        </div>
        <h2 className="settings-section-title">{t('Raccourcis clavier')}</h2>
        <p className="settings-section-description">
          {t('Gérez les raccourcis clavier pour Chatons')}
        </p>
      </div>

      <div className="settings-section-content">
        {shortcuts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {t('Aucun raccourci configuré')}
          </div>
        ) : (
          <div className="space-y-4">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium truncate">
                      {getActionName(shortcut.actionId)}
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                      {shortcut.scope}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {shortcut.accelerator}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={shortcut.enabled}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      await updateShortcut(shortcut.id, { enabled: checked });
                      await saveConfigs();
                      const updatedShortcuts = await getAllShortcuts();
                      setShortcuts(updatedShortcuts);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditClick(shortcut)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isDialogOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">{t('Modifier le raccourci')}</h3>
                <button onClick={() => setIsDialogOpen(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="accelerator" className="text-right">
                    {t('Raccourci')}
                  </label>
                  <div className="col-span-3">
                    <div className="flex items-center space-x-2">
                      <Input
                        id="accelerator"
                        value={editData.accelerator}
                        onChange={(e) => 
                          setEditData(prev => ({ ...prev, accelerator: e.target.value }))
                        }
                        onKeyDown={handleKeyDown}
                        placeholder={t('Appuyez sur une touche')}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={startRecording}
                        disabled={isRecording}
                      >
                        {isRecording ? t('Enregistrement...') : t('Enregistrer')}
                      </Button>
                    </div>
                    {recordedKeys.length > 0 && (
                      <div className="text-sm text-gray-500 mt-1">
                        {recordedKeys.join(' + ')}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="scope" className="text-right">
                    {t('Portée')}
                  </label>
                  <select
                    id="scope"
                    value={editData.scope}
                    onChange={(e) => 
                      setEditData(prev => ({ ...prev, scope: e.target.value as 'foreground' | 'global' }))
                    }
                    className="col-span-3 p-2 border rounded"
                  >
                    <option value="foreground">{t('Premier plan (fenêtre active)')}</option>
                    <option value="global">{t('Global (système)')}</option>
                  </select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="enabled" className="text-right">
                    {t('Activé')}
                  </label>
                  <div className="col-span-3 flex items-center">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={editData.enabled}
                      onChange={(e) => 
                        setEditData(prev => ({ ...prev, enabled: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-2 mt-6">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t('Annuler')}
                </Button>
                <Button onClick={handleSave}>{t('Enregistrer')}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}