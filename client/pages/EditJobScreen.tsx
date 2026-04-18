import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/ui/Toast";
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  ImageIcon,
  MapPin,
  Tag,
  X,
  Loader2,
  ArrowLeft,
  AlertTriangle,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import { JOB_CATEGORIES, JOB_TAGS, canJobsOverlap, getCategoryById } from "../../shared/constants/categories";
import { CustomDateInput } from "@/components/ui/CustomDatePicker";
import LocationAutocomplete from "@/components/ui/LocationAutocomplete";
import FileUploadWithPreview from "@/components/ui/FileUploadWithPreview";

interface FormFieldProps {
  label: string;
  icon: React.ElementType;
  description?: string;
  children: React.ReactNode;
}

function FormField({
  label,
  icon: Icon,
  description,
  children,
}: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-slate-200 mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          {label}
        </div>
      </label>
      {children}
      {description && (
        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">{description}</p>
      )}
    </div>
  );
}

export default function EditJobScreen() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { success: toastSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [location, setLocation] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [jobStatus, setJobStatus] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [hasExpiredDates, setHasExpiredDates] = useState(false);
  const [originalEndDate, setOriginalEndDate] = useState("");
  const [endDateFlexible, setEndDateFlexible] = useState(false);
  const [overlapWarning, setOverlapWarning] = useState<{ message: string; jobTitle: string } | null>(null);
  const [userJobs, setUserJobs] = useState<any[]>([]);

  // Check if user has updated dates to valid future dates
  const datesAreValid = () => {
    if (!hasExpiredDates) return true;
    if (!startDate) return false;

    // If endDateFlexible is true, only startDate is required
    if (endDateFlexible) {
      const now = new Date();
      const newStart = new Date(startDate);
      if (isNaN(newStart.getTime())) return false;
      return newStart > now;
    }

    if (!endDate) return false;

    const now = new Date();
    const newStart = new Date(startDate);
    const newEnd = new Date(endDate);

    // Check if dates are valid Date objects
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) return false;

    // For rescheduling: only require end date to be in the future
    // Start date can be in the past if user is editing quickly
    // End date must be after start date
    return newEnd > now && newEnd > newStart;
  };

  // Check if dates have been changed from original expired dates
  const datesHaveChanged = () => {
    if (!originalEndDate) return false;
    const originalEnd = new Date(originalEndDate);
    const newEnd = new Date(endDate);
    // Consider changed if end date is different by more than 1 minute
    return Math.abs(newEnd.getTime() - originalEnd.getTime()) > 60000;
  };

  // Fields should be disabled if dates are expired and not yet updated to valid future dates
  // But allow editing if user has changed the dates to valid future dates
  const fieldsDisabled = hasExpiredDates && !datesAreValid();

  // Fetch job data
  useEffect(() => {
    const fetchJob = async () => {
      try {
        const response = await fetch(`/api/jobs/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();

        if (data.success && data.job) {
          const job = data.job;

          // Check if user is the owner
          const clientId = typeof job.client === 'string' ? job.client : (job.client?.id || job.client?._id);
          const userId = user?.id || user?._id;

          if (clientId !== userId) {
            setError(t('jobs.noPermissionToEdit', 'You do not have permission to edit this job'));
            setLoading(false);
            return;
          }

          // Populate form fields
          setTitle(job.title || "");
          setSummary(job.summary || "");
          setDescription(job.description || "");
          setPrice(job.price?.toString() || "");
          setSelectedCategory(job.category || "");
          setSelectedTags(job.tags || []);
          setLocation(job.location || "");
          setNeighborhood(job.neighborhood || "");
          setStartDate(job.startDate ? new Date(job.startDate).toISOString().slice(0, 16) : "");
          setEndDate(job.endDate ? new Date(job.endDate).toISOString().slice(0, 16) : "");
          setEndDateFlexible(job.endDateFlexible || false);
          setExistingImages(job.images || []);
          setJobStatus(job.status || "");
          setCancellationReason(job.cancellationReason || "");

          // Check if job has expired dates (only if endDateFlexible is false)
          if (!job.endDateFlexible && job.endDate) {
            const jobEnd = new Date(job.endDate);
            const now = new Date();
            if (jobEnd < now) {
              setHasExpiredDates(true);
              setOriginalEndDate(job.endDate);
            }
          }
        } else {
          setError(data.message || t('jobs.errorLoadingJob', 'Could not load the job'));
        }
      } catch (err) {
        setError(t('jobs.errorLoadingJob', 'Error loading job'));
        console.error("Error fetching job:", err);
      } finally {
        setLoading(false);
      }
    };

    if (id && token) {
      fetchJob();
    }
  }, [id, token, user]);

  // Fetch user's other jobs for overlap validation
  useEffect(() => {
    const fetchUserJobs = async () => {
      if (!token || !user) return;
      try {
        const response = await fetch(`/api/jobs/my-jobs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.success) {
          // Filter out the current job and only keep active ones
          const activeJobs = (data.jobs || []).filter((job: any) =>
            job.id !== id &&
            job._id !== id &&
            ['open', 'in_progress', 'pending_payment', 'pending_approval'].includes(job.status)
          );
          setUserJobs(activeJobs);
        }
      } catch (err) {
        console.error('Error fetching user jobs:', err);
      }
    };
    fetchUserJobs();
  }, [token, user, id]);

  // Check for date overlaps when dates or category change
  useEffect(() => {
    if (!startDate || !selectedCategory || userJobs.length === 0) {
      setOverlapWarning(null);
      return;
    }

    const newStart = new Date(startDate);
    const newEnd = endDateFlexible ? null : (endDate ? new Date(endDate) : null);

    for (const existingJob of userJobs) {
      const existingStart = new Date(existingJob.startDate);
      const existingEnd = existingJob.endDateFlexible ? null : (existingJob.endDate ? new Date(existingJob.endDate) : null);

      // Check if dates overlap
      let datesOverlap = false;

      if (endDateFlexible || existingJob.endDateFlexible) {
        // For flexible jobs, check if start dates are on the same day
        datesOverlap = newStart.toDateString() === existingStart.toDateString();
      } else if (newEnd && existingEnd) {
        // Both have fixed dates - check proper overlap
        datesOverlap = newStart <= existingEnd && newEnd >= existingStart;
      }

      if (datesOverlap) {
        // Check if categories can overlap
        if (!canJobsOverlap(selectedCategory, existingJob.category)) {
          const existingCategoryInfo = getCategoryById(existingJob.category);
          const newCategoryInfo = getCategoryById(selectedCategory);

          setOverlapWarning({
            message: `Los trabajos de ${newCategoryInfo?.label || selectedCategory} no pueden superponerse con trabajos de ${existingCategoryInfo?.label || existingJob.category}. Solo se permite superposición entre trabajos presenciales y remotos (tecnología).`,
            jobTitle: existingJob.title
          });
          return;
        }
      }
    }

    setOverlapWarning(null);
  }, [startDate, endDate, endDateFlexible, selectedCategory, userJobs]);

  const handleAddTag = (tag: string) => {
    if (tag && !selectedTags.includes(tag) && selectedTags.length < 10) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setSelectedTags(selectedTags.filter((tag) => tag !== tagToRemove));
  };

  const handleAddCustomTag = () => {
    if (customTag.trim()) {
      handleAddTag(customTag.trim().toLowerCase());
      setCustomTag("");
    }
  };

  const handleRemoveExistingImage = (imageUrl: string) => {
    setExistingImages(existingImages.filter(img => img !== imageUrl));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const submitData = new FormData();

    submitData.append("title", title);
    submitData.append("summary", summary);
    submitData.append("description", description);
    submitData.append("price", price);
    submitData.append("category", selectedCategory);
    submitData.append("tags", JSON.stringify(selectedTags));
    submitData.append("location", location);
    if (neighborhood) submitData.append("neighborhood", neighborhood);
    submitData.append("startDate", startDate);
    submitData.append("endDateFlexible", endDateFlexible.toString());
    if (!endDateFlexible && endDate) {
      submitData.append("endDate", endDate);
    }
    submitData.append("existingImages", JSON.stringify(existingImages));

    // Add new files
    selectedFiles.forEach((file) => {
      submitData.append("images", file);
    });

    try {
      const response = await fetch(`/api/jobs/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: submitData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al actualizar el trabajo");
      }

      // Show success message based on whether it needs approval
      if (data.requiresApproval) {
        toastSuccess(
          t('jobs.sentForApproval', 'Job sent for approval'),
          t('jobs.sentForApprovalDesc', 'Your job has been updated and will be reviewed by our team before publishing.')
        );
      } else {
        toastSuccess(t('jobs.jobUpdated', 'Job updated'), t('jobs.jobUpdatedDesc', 'Changes have been saved successfully.'));
      }

      // Redirect back to job detail
      navigate(`/jobs/${id}`);
    } catch (err: any) {
      setError(err.message || t('jobs.errorUpdatingJob', 'Could not update the job. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  if (error && !title) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link
            to="/"
            className="text-sky-600 hover:text-sky-700 font-medium"
          >
            {t('common.backToHome', 'Back to home')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{t('jobs.editPageTitle', 'Edit Job - DoApp')}</title>
        <meta name="description" content={t('jobs.editMetaDescription', 'Edit your job posting on DoApp.')} />
      </Helmet>
      <div className="container mx-auto max-w-4xl py-8 px-4">
        <div className="mb-6">
          <Link
            to={`/jobs/${id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('jobs.backToJob', 'Back to job')}
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          {t('jobs.editTitle', 'Edit job')}
        </h1>
        <p className="mt-2 text-lg leading-8 text-gray-600 dark:text-slate-400">
          {t('jobs.editSubtitle', 'Modify the details of your posting.')}
        </p>

        {(jobStatus === 'cancelled' || jobStatus === 'rejected') && !hasExpiredDates && (
          cancellationReason?.includes('Ningún trabajador se postuló') ? (
            <div className="mt-4 rounded-xl border border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 p-4">
              <p className="text-blue-800 dark:text-blue-200 text-sm font-medium mb-2">
                {t('jobs.reschedulingNoApplicants', 'Rescheduling job with no applicants')}
              </p>
              <p className="text-blue-700 dark:text-blue-300 text-sm">
                {t('jobs.reschedulingNoApplicantsDesc', 'Update the dates and consider adjusting the budget or adding more details to attract workers. When you save, your job will be automatically republished.')}
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-amber-500/50 bg-amber-50 dark:bg-amber-900/20 p-4">
              <p className="text-amber-700 dark:text-amber-300 text-sm">
                <strong>{t('common.note', 'Note')}:</strong> {t('jobs.cancelledOrRejectedNote', 'This job was {{status}}. When you save the changes, it will be automatically sent for review and approval before being published.', { status: jobStatus === 'cancelled' ? t('jobs.statusCancelled', 'cancelled') : t('jobs.statusRejected', 'rejected') })}
              </p>
            </div>
          )
        )}

        {hasExpiredDates && (
          <div className="mt-4 rounded-xl border-2 border-red-500/50 bg-red-50 dark:bg-red-900/20 p-4">
            <p className="text-red-700 dark:text-red-300 text-sm font-medium mb-2">
              {t('jobs.expiredDatesWarning', 'This job has expired dates')}
            </p>
            <p className="text-red-600 dark:text-red-400 text-sm">
              {t('jobs.expiredDatesDesc', 'The scheduled dates for this job have passed. You must first update the start and end dates to valid future dates. Once the dates are correct, you can edit the other fields.')}
            </p>
            {!fieldsDisabled && (
              <p className="text-green-600 dark:text-green-400 text-sm mt-2">
                {t('jobs.datesValidNow', 'The new dates are valid. You can now edit all fields and save the changes.')}
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          <div className="space-y-6 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
            <FormField
              label={t('jobs.titleLabel', 'Job title')}
              icon={FileText}
              description={t('jobs.titleDescription', 'Be clear and specific.')}
            >
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={fieldsDisabled}
                placeholder={t('jobs.titlePlaceholder', 'E.g.: Kitchen pipe repair')}
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </FormField>

            <FormField
              label={t('jobs.summaryLabel', 'Brief summary')}
              icon={FileText}
              description={t('jobs.summaryDescription', 'A short summary of the job (max 200 characters)')}
            >
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
                disabled={fieldsDisabled}
                maxLength={200}
                placeholder={t('jobs.summaryPlaceholder', 'E.g.: I need to fix a water leak in the kitchen')}
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </FormField>

            <FormField
              label={t('jobs.descriptionLabel', 'Detailed description')}
              icon={FileText}
              description={t('jobs.descriptionDescription', 'Include all important details of the required service.')}
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                required
                disabled={fieldsDisabled}
                placeholder={t('jobs.descriptionPlaceholder', 'Describe the problem, what you expect to be done, if special materials are needed, etc.')}
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </FormField>

            <FormField
              label={t('jobs.categoryLabel', 'Category')}
              icon={Tag}
              description={t('jobs.categoryDescription', 'Select the category that best describes your job')}
            >
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                required
                disabled={fieldsDisabled}
                className="block w-full rounded-md border-0 py-2 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{t('jobs.selectCategory', 'Select category...')}</option>
                {JOB_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label={t('jobs.tagsLabel', 'Tags')}
              icon={Tag}
              description={t('jobs.tagsDescription', 'Add tags to help your job be found (max 10)')}
            >
              <div className="space-y-3">
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 text-sm"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-sky-600 dark:hover:text-sky-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {JOB_TAGS.slice(0, 20).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddTag(tag)}
                      disabled={fieldsDisabled || selectedTags.includes(tag) || selectedTags.length >= 10}
                      className="px-3 py-1 rounded-full border border-gray-300 dark:border-slate-600 text-sm hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-slate-300"
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCustomTag())}
                    placeholder={t('jobs.customTagPlaceholder', 'Or add a custom tag')}
                    disabled={fieldsDisabled || selectedTags.length >= 10}
                    className="block flex-1 rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTag}
                    disabled={fieldsDisabled || !customTag.trim() || selectedTags.length >= 10}
                    className="px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {t('common.add', 'Add')}
                  </button>
                </div>
              </div>
            </FormField>

            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <FormField label={t('jobs.budgetLabel', 'Budget (ARS)')} icon={DollarSign}>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    disabled={fieldsDisabled}
                    min="0"
                    step="1"
                    placeholder="15000"
                    onKeyPress={(e) => {
                      if (!/[0-9]/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label={t('jobs.cityLabel', 'City')} icon={MapPin}>
                  <LocationAutocomplete
                    value={location}
                    onChange={setLocation}
                    placeholder={t('jobs.locationPlaceholder')}
                    required
                    disabled={fieldsDisabled}
                    name="location"
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label={t('jobs.neighborhoodLabel', 'Neighborhood (optional)')} icon={MapPin}>
                  <input
                    type="text"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    placeholder={t('jobs.locationPlaceholder')}
                    disabled={fieldsDisabled}
                    className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </FormField>
              </div>
            </div>

            <div className={`grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 ${hasExpiredDates ? 'p-4 rounded-xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20' : ''}`}>
              {hasExpiredDates && (
                <div className="sm:col-span-6 mb-2">
                  <p className="text-amber-700 dark:text-amber-300 text-sm font-medium">
                    {t('jobs.jobExpiredSelectDates', 'This job expired. Select new dates to save it:')}
                  </p>
                  <ul className="text-amber-600 dark:text-amber-400 text-xs mt-1 list-disc list-inside">
                    <li>{t('jobs.endDateMustBeFuture', 'The end date must be in the future')}</li>
                    <li>{t('jobs.endDateMustBeAfterStart', 'The end date must be after the start date')}</li>
                  </ul>
                  {datesAreValid() && (
                    <p className="text-green-600 dark:text-green-400 text-sm mt-2 font-medium">
                      {t('jobs.newDatesValid', 'The new dates are valid')}
                    </p>
                  )}
                </div>
              )}
              <div className="sm:col-span-3">
                <FormField label={t('jobs.startDateLabel', 'Start date')} icon={Calendar}>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    min={new Date().toISOString().slice(0, 16)}
                    className="block w-full rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-3 px-4 text-gray-900 dark:text-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all"
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField label={t('jobs.endDateLabel', 'Estimated end date')} icon={Clock}>
                  {!endDateFlexible && (
                    <input
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                      min={startDate || new Date().toISOString().slice(0, 16)}
                      className="block w-full rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-3 px-4 text-gray-900 dark:text-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all"
                    />
                  )}
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={endDateFlexible}
                      onChange={(e) => setEndDateFlexible(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500 dark:bg-slate-700"
                    />
                    <span className="text-sm text-gray-600 dark:text-slate-400">
                      {t('jobs.dontKnowYet', "I don't know yet")}
                    </span>
                  </label>
                  {endDateFlexible && (
                    <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="inline h-4 w-4 mr-1" />
                        {t('jobs.flexibleEndDateWarning', 'You must define the end date before 24 hours prior to the job start, otherwise the job will be suspended.')}
                      </p>
                    </div>
                  )}
                </FormField>
              </div>
            </div>

            {/* Overlap Warning */}
            {overlapWarning && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-800 dark:text-red-200">
                      {t('jobs.scheduleConflict', 'Schedule conflict with "{{jobTitle}}"', { jobTitle: overlapWarning.jobTitle })}
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      {overlapWarning.message}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Existing Images */}
            {existingImages.length > 0 && (
              <FormField label={t('jobs.existingImages', 'Existing images')} icon={ImageIcon}>
                <div className="flex flex-wrap gap-3">
                  {existingImages.map((img, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={img}
                        alt={`Imagen ${index + 1}`}
                        className="h-24 w-24 object-cover rounded-lg border border-slate-600"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingImage(img)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </FormField>
            )}

            <FormField
              label={t('jobs.addNewPhotos', 'Add new photos (optional)')}
              icon={ImageIcon}
            >
              <FileUploadWithPreview
                label=""
                description="PNG, JPG, GIF hasta 10MB"
                name="images"
                maxSizeMB={10}
                maxFiles={5 - existingImages.length}
                accept="image/*"
                onChange={setSelectedFiles}
              />
            </FormField>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {/* Help Section - Report problems or request modifications */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 p-4">
            <div className="flex items-start gap-3">
              <HelpCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white text-sm">
                  {t('jobs.needHelp', 'Need help with this job?')}
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                  {t('jobs.needHelpDesc', 'If you have problems with the contract, need to make modifications you cannot do yourself, or have any issues with the worker, you can open a support ticket.')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/tickets/new?jobId=${id}&type=support`}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-900/50 rounded-lg transition-colors"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {t('jobs.reportProblem', 'Report problem')}
                  </Link>
                  <Link
                    to="/help"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    <HelpCircle className="h-4 w-4" />
                    {t('jobs.helpCenter', 'Help center')}
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-x-6">
            <Link
              to={`/jobs/${id}`}
              className="text-sm font-semibold leading-6 text-gray-900 dark:text-slate-300 hover:text-gray-700 dark:hover:text-white"
            >
              {t('common.cancel', 'Cancel')}
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || fieldsDisabled || !!overlapWarning}
              className="rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 hover:from-sky-600 hover:to-sky-700 hover:shadow-sky-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isSubmitting ? t('common.saving', 'Saving...') : overlapWarning ? t('jobs.resolveConflict', 'Resolve the schedule conflict') : fieldsDisabled ? t('jobs.updateDatesFirst', 'Update dates first') : t('common.saveChanges', 'Save changes')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
