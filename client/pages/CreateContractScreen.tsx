import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  ImageIcon,
  MapPin,
  Tag,
  X,
  AlertTriangle,
  Info,
  Users,
  CheckCircle,
  ListTodo,
  Home,
  Hash,
  CreditCard,
  Settings,
  ArrowRight,
} from "lucide-react";
import { JOB_CATEGORIES, JOB_TAGS, canJobsOverlap, getCategoryById } from "../../shared/constants/categories";
import { CustomDateInput } from "@/components/ui/CustomDatePicker";
import LocationAutocomplete from "@/components/ui/LocationAutocomplete";
import StreetAutocomplete from "@/components/ui/StreetAutocomplete";
import FileUploadWithPreview from "@/components/ui/FileUploadWithPreview";
import NeighborhoodAutocomplete from "@/components/ui/NeighborhoodAutocomplete";

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

export default function CreateContractScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refreshUser, token } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [location, setLocation] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [maxWorkers, setMaxWorkers] = useState(1);
  const [requirements, setRequirements] = useState(['', '', '']);
  const [endDateFlexible, setEndDateFlexible] = useState(false);
  const [singleDelivery, setSingleDelivery] = useState(true);
  const [neighborhood, setNeighborhood] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressDetails, setAddressDetails] = useState("");

  // Banking prompt modal state
  const [showBankingModal, setShowBankingModal] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  // Date overlap validation state
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [overlapWarning, setOverlapWarning] = useState<{ message: string; jobTitle: string } | null>(null);
  const [userJobs, setUserJobs] = useState<any[]>([]);

  // Check if user has banking info configured
  const hasBankingInfo = !!(
    user?.bankingInfo?.cbu ||
    user?.bankingInfo?.alias
  );

  // Check if user opted out of banking prompts
  const dontAskBankingInfo = user?.dontAskBankingInfo || false;

  // Fetch user's jobs for overlap validation
  useEffect(() => {
    const fetchUserJobs = async () => {
      if (!token || !user) return;
      try {
        const response = await fetch(`/api/jobs/my-jobs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.success) {
          const activeJobs = (data.jobs || []).filter((job: any) =>
            ['open', 'in_progress', 'pending_payment', 'pending_approval'].includes(job.status)
          );
          setUserJobs(activeJobs);
        }
      } catch (err) {
        console.error('Error fetching user jobs:', err);
      }
    };
    fetchUserJobs();
  }, [token, user]);

  // Check for date overlaps when dates or category change
  useEffect(() => {
    if (!startDate || !selectedCategory || userJobs.length === 0) {
      setOverlapWarning(null);
      return;
    }

    const newStart = startDate;
    const newEnd = endDateFlexible ? null : endDate;

    for (const existingJob of userJobs) {
      const existingStart = new Date(existingJob.startDate);
      const existingEnd = existingJob.endDateFlexible ? null : (existingJob.endDate ? new Date(existingJob.endDate) : null);

      let datesOverlap = false;

      if (endDateFlexible || existingJob.endDateFlexible) {
        datesOverlap = newStart.toDateString() === existingStart.toDateString();
      } else if (newEnd && existingEnd) {
        datesOverlap = newStart <= existingEnd && newEnd >= existingStart;
      }

      if (datesOverlap) {
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

  // Build FormData from form
  const buildFormData = (formDataFromForm: FormData): FormData => {
    const submitData = new FormData();

    submitData.append("title", formDataFromForm.get("title") as string);
    submitData.append("summary", formDataFromForm.get("summary") as string);
    submitData.append("description", formDataFromForm.get("description") as string);
    submitData.append("price", formDataFromForm.get("budget") as string);
    submitData.append("category", selectedCategory);
    submitData.append("tags", JSON.stringify(selectedTags));
    submitData.append("location", formDataFromForm.get("location") as string);
    if (neighborhood) submitData.append("neighborhood", neighborhood);
    if (postalCode) submitData.append("postalCode", postalCode);
    submitData.append("addressStreet", addressStreet);
    submitData.append("addressNumber", addressNumber);
    submitData.append("addressDetails", addressDetails);
    submitData.append("startDate", formDataFromForm.get("startDate") as string);
    submitData.append("endDateFlexible", endDateFlexible.toString());
    if (!endDateFlexible) {
      submitData.append("endDate", formDataFromForm.get("endDate") as string);
    }
    submitData.append("remoteOk", formDataFromForm.get("remoteOk") === "on" ? "true" : "false");
    submitData.append("maxWorkers", maxWorkers.toString());
    submitData.append("singleDelivery", singleDelivery.toString());
    const filledReqs = requirements.filter(r => r.trim());
    submitData.append("completionRequirements", JSON.stringify(filledReqs));

    selectedFiles.forEach((file) => {
      submitData.append("images", file);
    });

    return submitData;
  };

  // Actually submit the job
  const submitJob = async (formData: FormData) => {
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al crear el trabajo");
      }

      await refreshUser();

      if (data.requiresPayment) {
        navigate(`/jobs/${data.job.id || data.job._id}/payment`);
      } else {
        navigate("/");
      }
    } catch (err: any) {
      setError(
        err.message || t('contracts.errorPublishing', 'Could not publish the job. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle "Don't ask again" for banking prompt
  const handleDontAskAgain = async () => {
    try {
      await fetch("/api/auth/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ dontAskBankingInfo: true }),
      });
      await refreshUser();
    } catch (err) {
      console.error("Error saving preference:", err);
    }
    setShowBankingModal(false);
    if (pendingFormData) {
      submitJob(pendingFormData);
    }
  };

  // Continue without adding banking info
  const handleContinueWithoutBanking = () => {
    setShowBankingModal(false);
    if (pendingFormData) {
      submitJob(pendingFormData);
    }
  };

  // Go to settings to add banking info
  const handleGoToSettings = () => {
    setShowBankingModal(false);
    navigate("/settings?tab=banking");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formDataFromForm = new FormData(event.currentTarget);
    const submitData = buildFormData(formDataFromForm);

    // If user doesn't have banking info and hasn't opted out, show the modal
    if (!hasBankingInfo && !dontAskBankingInfo) {
      setPendingFormData(submitData);
      setShowBankingModal(true);
      setIsSubmitting(false);
      return;
    }

    // Otherwise proceed with submission
    await submitJob(submitData);
  };

  return (
    <>
      <Helmet>
        <title>{t('contracts.createPageTitle', 'Create New Contract - DoApp')}</title>
        <meta
          name="description"
          content={t('contracts.createMetaDescription', 'Post a new job or service on DoApp.')}
        />
      </Helmet>
      <div className="container mx-auto max-w-4xl py-8 px-4">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
          >
            &larr; {t('common.backToHome', 'Back to home')}
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          {t('contracts.publishNewJob', 'Publish a new job')}
        </h1>
        <p className="mt-2 text-lg leading-8 text-gray-600 dark:text-slate-400">
          {t('contracts.publishDescription', 'Describe the service you need so professionals can apply.')}
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          <div className="space-y-6 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
            <FormField
              label={t('jobs.titleLabel', 'Job title')}
              icon={FileText}
              description={t('jobs.titleDescription', 'Be clear and specific.')}
            >
              <input
                name="title"
                type="text"
                required
                placeholder={t('jobs.titlePlaceholder', 'E.g.: Kitchen pipe repair')}
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
              />
            </FormField>

            <FormField
              label={t('jobs.summaryLabel', 'Brief summary')}
              icon={FileText}
              description={t('jobs.summaryDescription', 'A short summary of the job (max 200 characters)')}
            >
              <input
                name="summary"
                type="text"
                required
                maxLength={200}
                placeholder={t('jobs.summaryPlaceholder', 'E.g.: I need to fix a water leak in the kitchen')}
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
              />
            </FormField>

            <FormField
              label={t('jobs.descriptionLabel', 'Detailed description')}
              icon={FileText}
              description={t('jobs.descriptionDescription', 'Include all important details of the required service.')}
            >
              <textarea
                name="description"
                rows={5}
                required
                placeholder={t('jobs.descriptionPlaceholder', 'Describe the problem, what you expect to be done, if special materials are needed, etc.')}
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
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
                className="block w-full rounded-md border-0 py-2 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
              >
                <option value="">{t('jobs.selectCategory', 'Select category...')}</option>
                {JOB_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {t(cat.labelKey, cat.label)}
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
                {/* Selected tags */}
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

                {/* Quick tags */}
                <div className="flex flex-wrap gap-2">
                  {JOB_TAGS.slice(0, 20).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddTag(tag)}
                      disabled={selectedTags.includes(tag) || selectedTags.length >= 10}
                      className="px-3 py-1 rounded-full border border-gray-300 dark:border-slate-600 text-sm hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-slate-300"
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                {/* Custom tag input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCustomTag())}
                    placeholder={t('jobs.customTagPlaceholder', 'Or add a custom tag')}
                    disabled={selectedTags.length >= 10}
                    className="block flex-1 rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTag}
                    disabled={!customTag.trim() || selectedTags.length >= 10}
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
                    name="budget"
                    type="number"
                    required
                    min="0"
                    step="1"
                    placeholder="15000"
                    onKeyPress={(e) => {
                      if (!/[0-9]/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField label={t('jobs.locationLabel', 'Location')} icon={MapPin}>
                  <LocationAutocomplete
                    value={location}
                    onChange={setLocation}
                    placeholder={t('jobs.locationPlaceholder')}
                    required
                    name="location"
                  />
                </FormField>
              </div>
            </div>

            {/* Address details */}
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <FormField label={t('jobs.streetLabel', 'Calle')} icon={Home}>
                  <StreetAutocomplete
                    value={addressStreet}
                    onChange={setAddressStreet}
                    location={location}
                    placeholder="Ej: Av. Corrientes"
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField label={t('jobs.numberLabel', 'Número de puerta')} icon={Hash}>
                  <input
                    type="text"
                    value={addressNumber}
                    onChange={(e) => setAddressNumber(e.target.value)}
                    placeholder="Ej: 1234"
                    className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
                  />
                </FormField>
              </div>
            </div>
            <NeighborhoodAutocomplete
              locationValue={location}
              neighborhood={neighborhood}
              postalCode={postalCode}
              onNeighborhoodChange={setNeighborhood}
              onPostalCodeChange={setPostalCode}
            />

            <FormField
              label={t('jobs.addressDetailsLabel', 'Address details (optional)')}
              icon={MapPin}
              description={t('jobs.addressDetailsDescription', 'Floor, apartment, cross streets or other references to find the place')}
            >
              <input
                type="text"
                value={addressDetails}
                onChange={(e) => setAddressDetails(e.target.value)}
                placeholder={t('jobs.addressDetailsPlaceholder')}
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
              />
            </FormField>

            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <FormField label={t('jobs.startDateLabel', 'Start date')} icon={Calendar}>
                  <CustomDateInput
                    name="startDate"
                    type="datetime"
                    required
                    placeholder={t('jobs.startDatePlaceholder')}
                    minDate={new Date()}
                    onDateChange={(date) => setStartDate(date)}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField label={t('jobs.endDateLabel', 'Estimated end date')} icon={Clock}>
                  {!endDateFlexible && (
                    <CustomDateInput
                      name="endDate"
                      type="datetime"
                      required
                      placeholder={t('jobs.endDatePlaceholder')}
                      minDate={new Date()}
                      onDateChange={(date) => setEndDate(date)}
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

            {/* Single Delivery Option */}
            <FormField
              label={t('contracts.deliveryType', 'Delivery type')}
              icon={ListTodo}
              description={t('contracts.deliveryTypeDescription', 'Define how the job tasks will be delivered')}
            >
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-4 rounded-lg border border-gray-300 dark:border-slate-600 hover:border-sky-500 dark:hover:border-sky-500 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="deliveryType"
                    checked={singleDelivery}
                    onChange={() => setSingleDelivery(true)}
                    className="mt-1 w-4 h-4 text-sky-600 focus:ring-sky-500 dark:bg-slate-700"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                      <span className="font-medium text-gray-900 dark:text-white">{t('contracts.singleDelivery', 'Single delivery')}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                      {t('contracts.singleDeliveryDesc', 'All work is delivered at the end, on the estimated completion date.')}
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-lg border border-gray-300 dark:border-slate-600 hover:border-sky-500 dark:hover:border-sky-500 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="deliveryType"
                    checked={!singleDelivery}
                    onChange={() => setSingleDelivery(false)}
                    className="mt-1 w-4 h-4 text-sky-600 focus:ring-sky-500 dark:bg-slate-700"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <ListTodo className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                      <span className="font-medium text-gray-900 dark:text-white">{t('contracts.taskDelivery', 'Per-task delivery')}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                      {t('contracts.taskDeliveryDesc', 'Each task can have its own estimated delivery date as a guide. The final date remains the important one.')}
                    </p>
                  </div>
                </label>

                {!singleDelivery && (
                  <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
                    <p className="text-sm text-sky-700 dark:text-sky-300">
                      <Info className="inline h-4 w-4 mr-1" />
                      {t('contracts.addTasksAfterPublish', 'You can add tasks with individual delivery dates after publishing the job.')}
                    </p>
                  </div>
                )}
              </div>
            </FormField>

            <FormField
              label={t('contracts.workersCount', 'Number of workers')}
              icon={Users}
              description={t('contracts.workersCountDescription', 'How many people do you need for this job? (1-5)')}
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMaxWorkers(Math.max(1, maxWorkers - 1))}
                    disabled={maxWorkers <= 1}
                    className="w-10 h-10 rounded-lg border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-xl font-semibold text-gray-900 dark:text-white">
                    {maxWorkers}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMaxWorkers(Math.min(5, maxWorkers + 1))}
                    disabled={maxWorkers >= 5}
                    className="w-10 h-10 rounded-lg border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm text-gray-500 dark:text-slate-400">
                  {maxWorkers === 1 ? t('contracts.oneWorker', '1 worker') : t('contracts.nWorkers', '{{count}} workers', { count: maxWorkers })}
                </span>
              </div>
              {maxWorkers > 1 && (
                <div className="mt-3 p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
                  <p className="text-sm text-sky-700 dark:text-sky-300">
                    <Users className="inline h-4 w-4 mr-1" />
                    {t('contracts.groupChatInfo', 'A group chat will be created with all selected workers')}
                  </p>
                </div>
              )}
            </FormField>

            {/* Completion Requirements */}
            <FormField
              label="Requisitos de finalización"
              icon={ListTodo}
              description="Definí los criterios mínimos para que el trabajo sea considerado terminado. Sirven como respaldo ante posibles disputas. Se sugiere a los trabajadores consultar estos requisitos antes de postularse."
            >
              <div className="space-y-2">
                {requirements.map((req, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span className="mt-2.5 text-sm font-semibold text-slate-500 dark:text-slate-400 w-5 shrink-0">{idx + 1}.</span>
                    <input
                      type="text"
                      value={req}
                      onChange={(e) => {
                        const updated = [...requirements];
                        updated[idx] = e.target.value;
                        setRequirements(updated);
                      }}
                      placeholder={idx === 0 ? 'Ej: Sin telas de araña en esquinas de paredes' : idx === 1 ? 'Ej: Pisos barridos y trapeados en todos los ambientes' : 'Ej: Baños desinfectados y limpios'}
                      className="flex-1 rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm"
                    />
                    {requirements.length > 3 && (
                      <button type="button" onClick={() => setRequirements(requirements.filter((_, i) => i !== idx))} className="mt-1.5 p-1.5 text-red-500 hover:text-red-700">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {requirements.length < 8 && (
                  <button
                    type="button"
                    onClick={() => setRequirements([...requirements, ''])}
                    className="mt-1 flex items-center gap-1.5 text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400"
                  >
                    <span className="text-lg leading-none">+</span> Agregar requisito
                  </button>
                )}
              </div>
            </FormField>

            <FormField
              label={t('jobs.photosLabel', 'Photos (optional)')}
              icon={ImageIcon}
            >
              <FileUploadWithPreview
                label=""
                description="PNG, JPG, GIF hasta 10MB"
                name="images"
                maxSizeMB={10}
                maxFiles={5}
                accept="image/*"
                onChange={setSelectedFiles}
              />
            </FormField>
          </div>

          {/* Aviso de condiciones importantes */}
          <div className="rounded-xl border border-sky-300 dark:border-sky-500/50 bg-sky-50 dark:bg-sky-900/20 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-sky-500 dark:text-sky-400 shrink-0 mt-0.5" />
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                  {t('contracts.importantConditions', 'Important conditions when publishing')}
                </h3>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-500 dark:text-sky-400" />
                    <span>
                      <strong className="text-gray-700 dark:text-gray-300">{t('contracts.workerSelectionLabel', 'Worker selection:')}</strong> {t('contracts.workerSelectionDesc', 'Once you receive applications, you must select a worker before 24 hours prior to the job start.')}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-500 dark:text-sky-400" />
                    <span>
                      <strong className="text-gray-700 dark:text-gray-300">{t('contracts.autoSelectionLabel', 'Auto-selection:')}</strong> {t('contracts.autoSelectionDesc', 'If you do not select a worker in time, the first applicant will be automatically assigned.')}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-500 dark:text-sky-400" />
                    <span>
                      <strong className="text-gray-700 dark:text-gray-300">{t('contracts.cancellationLabel', 'Cancellation:')}</strong> {t('contracts.cancellationDesc', 'If you cancel the job after publishing, you will lose the publication commission paid.')}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-x-6">
            <Link
              to="/"
              className="text-sm font-semibold leading-6 text-gray-900 dark:text-slate-300 hover:text-gray-700 dark:hover:text-white"
            >
              {t('common.cancel', 'Cancel')}
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !!overlapWarning}
              className="rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 hover:from-sky-600 hover:to-sky-700 hover:shadow-sky-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isSubmitting ? t('contracts.publishing', 'Publishing...') : overlapWarning ? t('jobs.resolveConflict', 'Resolve the schedule conflict') : t('contracts.publishJob', 'Publish job')}
            </button>
          </div>
        </form>
      </div>

      {/* Banking Info Modal */}
      {showBankingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="bg-sky-50 dark:bg-sky-900/30 p-6 border-b border-sky-100 dark:border-sky-800">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-sky-100 dark:bg-sky-800 flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('contracts.bankingNotConfigured', 'Banking details not configured')}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('contracts.bankingNotConfiguredDesc', 'To receive payments for your jobs')}
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                {t('contracts.bankingExplanation', 'You do not have your banking details configured. When you complete jobs as a professional, you will need these details to receive your payments.')}
              </p>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>{t('common.tip', 'Tip')}:</strong> {t('contracts.bankingTip', 'If you use Mercado Pago, payments are credited within 48 hours. Other banks may take until the end of the month.')}
                  </span>
                </p>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('contracts.addBankingNow', 'Would you like to add your banking details now?')}
              </p>
            </div>

            {/* Actions */}
            <div className="p-6 bg-gray-50 dark:bg-slate-900/50 border-t border-gray-200 dark:border-slate-700 space-y-3">
              <button
                onClick={handleGoToSettings}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-medium transition-colors"
              >
                <Settings className="h-4 w-4" />
                {t('contracts.addBankingDetails', 'Add banking details')}
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="flex gap-3">
                <button
                  onClick={handleContinueWithoutBanking}
                  className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors"
                >
                  {t('contracts.continueWithout', 'Continue without adding')}
                </button>
                <button
                  onClick={handleDontAskAgain}
                  className="flex-1 px-4 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors"
                >
                  {t('contracts.dontAskAgain', "Don't ask again")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
