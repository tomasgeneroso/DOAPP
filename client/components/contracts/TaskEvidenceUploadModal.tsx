import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { JobTask } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Button from '../ui/Button';
import { X, Camera, Upload, CheckCircle, Image, Trash2, AlertCircle } from 'lucide-react';

interface TaskEvidenceUploadModalProps {
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TaskEvidenceUploadModal({
  jobId,
  isOpen,
  onClose,
  onSuccess,
}: TaskEvidenceUploadModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{ [taskId: string]: string[] }>({});
  const [loading, setLoading] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load tasks that need evidence
  useEffect(() => {
    const loadTasks = async () => {
      if (!isOpen) return;

      setLoadingTasks(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/jobs/${jobId}/tasks/evidence-required`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (data.success) {
          setTasks(data.tasksWithoutEvidence || []);
          if (data.tasksWithoutEvidence?.length > 0) {
            setSelectedTask(data.tasksWithoutEvidence[0].id);
          }
        }
      } catch (err) {
        console.error('Error loading tasks:', err);
        setError(t('contracts.errorLoadingTasks', 'Error loading tasks'));
      } finally {
        setLoadingTasks(false);
      }
    };

    loadTasks();
  }, [isOpen, jobId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedTask) return;

    setUploading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const uploadedUrls: string[] = [];

      for (const file of Array.from(files)) {
        // Create form data for upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'evidence');

        // Upload the file
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const uploadData = await uploadResponse.json();
        if (uploadData.success && uploadData.url) {
          uploadedUrls.push(uploadData.url);
        }
      }

      if (uploadedUrls.length > 0) {
        setPhotos(prev => ({
          ...prev,
          [selectedTask]: [...(prev[selectedTask] || []), ...uploadedUrls],
        }));
      }
    } catch (err: any) {
      setError(t('contracts.errorUploadingPhotos', 'Error uploading photos'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = (taskId: string, photoIndex: number) => {
    setPhotos(prev => ({
      ...prev,
      [taskId]: prev[taskId].filter((_, index) => index !== photoIndex),
    }));
  };

  const handleSubmit = async () => {
    // Check if all tasks have at least one photo
    const tasksWithoutPhotos = tasks.filter(t => !photos[t.id] || photos[t.id].length === 0);

    if (tasksWithoutPhotos.length > 0) {
      setError(t('contracts.missingPhotos', 'You must upload photos for all tasks. Missing: {{tasks}}', { tasks: tasksWithoutPhotos.map(tk => tk.title).join(', ') }));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');

      // Upload evidence for each task
      for (const task of tasks) {
        const taskPhotos = photos[task.id] || [];
        if (taskPhotos.length > 0) {
          await fetch(`/api/jobs/${jobId}/tasks/${task.id}/evidence`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ photos: taskPhotos }),
          });
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || t('contracts.errorSavingEvidence', 'Error saving evidence'));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    // Allow skipping but show a warning
    if (confirm(t('contracts.skipEvidenceWarning', 'Evidence photos help protect your work in case of disputes. Are you sure you want to continue without uploading photos?'))) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const currentTask = tasks.find(t => t.id === selectedTask);
  const currentPhotos = selectedTask ? photos[selectedTask] || [] : [];
  const totalPhotosUploaded = Object.values(photos).reduce((sum, arr) => sum + arr.length, 0);
  const tasksWithPhotos = tasks.filter(t => photos[t.id]?.length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Camera className="h-6 w-6 text-sky-600" />
              {t('contracts.evidencePhotos', 'Evidence Photos')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {t('contracts.documentInitialState', 'Document the initial state of tasks before starting')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Info Box */}
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-sky-800 dark:text-sky-200">
                <p className="font-medium mb-1">{t('common.important', 'Important')}:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>{t('contracts.evidenceTip1', 'Take photos of the initial state before starting each task')}</li>
                  <li>{t('contracts.evidenceTip2', 'These photos will serve as evidence in case of disputes')}</li>
                  <li>{t('contracts.evidenceTip3', 'It is recommended to document the work area and materials')}</li>
                </ul>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {loadingTasks ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">{t('contracts.allTasksHaveEvidence', 'All tasks already have evidence')}</p>
              <p className="text-sm mt-1">{t('contracts.noTasksPendingDocumentation', 'No tasks pending documentation')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Task List */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('contracts.tasksToDocument', 'Tasks to Document')} ({tasksWithPhotos}/{tasks.length})
                </h3>
                {tasks.map((task) => {
                  const hasPhotos = photos[task.id]?.length > 0;
                  const isSelected = task.id === selectedTask;

                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task.id)}
                      className={`w-full text-left p-3 rounded-lg transition ${
                        isSelected
                          ? 'bg-sky-100 dark:bg-sky-900/30 border-2 border-sky-500'
                          : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {hasPhotos ? (
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <Camera className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        )}
                        <span className={`text-sm font-medium truncate ${
                          isSelected ? 'text-sky-900 dark:text-sky-100' : 'text-gray-900 dark:text-white'
                        }`}>
                          {task.title}
                        </span>
                      </div>
                      {hasPhotos && (
                        <span className="text-xs text-green-600 dark:text-green-400 ml-6">
                          {photos[task.id].length} foto{photos[task.id].length > 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Photo Upload Area */}
              <div className="md:col-span-2">
                {currentTask ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {currentTask.title}
                      </h3>
                      {currentTask.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {currentTask.description}
                        </p>
                      )}
                    </div>

                    {/* Upload Button */}
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                        id="photo-upload"
                      />
                      <label
                        htmlFor="photo-upload"
                        className="cursor-pointer flex flex-col items-center"
                      >
                        {uploading ? (
                          <>
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600 mb-3"></div>
                            <span className="text-gray-600 dark:text-gray-400">{t('common.uploading', 'Uploading...')}</span>
                          </>
                        ) : (
                          <>
                            <div className="bg-sky-100 dark:bg-sky-900/30 p-3 rounded-full mb-3">
                              <Upload className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                            </div>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {t('contracts.uploadPhotos', 'Upload photos')}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {t('contracts.clickOrDragImages', 'Click or drag images here')}
                            </span>
                          </>
                        )}
                      </label>
                    </div>

                    {/* Photo Grid */}
                    {currentPhotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-3">
                        {currentPhotos.map((photo, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={photo}
                              alt={t('contracts.evidencePhoto', 'Evidence {{number}}', { number: index + 1 })}
                              className="w-full h-24 object-cover rounded-lg"
                            />
                            <button
                              onClick={() => handleRemovePhoto(selectedTask!, index)}
                              className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    <Image className="h-12 w-12" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progress */}
          {tasks.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('common.progress', 'Progress')}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t('contracts.tasksDocumented', '{{done}} of {{total}} tasks documented', { done: tasksWithPhotos, total: tasks.length })}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                <div
                  className="bg-sky-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(tasksWithPhotos / tasks.length) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSkip}
              disabled={loading}
              className="flex-1"
            >
              {t('contracts.skipForNow', 'Skip for now')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || uploading || totalPhotosUploaded === 0}
              className="flex-1 bg-sky-600 hover:bg-sky-700 text-white"
            >
              {loading ? t('common.saving', 'Saving...') : t('contracts.saveEvidence', 'Save Evidence ({{count}} photos)', { count: totalPhotosUploaded })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
