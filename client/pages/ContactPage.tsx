import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const ContactPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const subjectParam = searchParams.get('subject') || 'general';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: subjectParam,
    message: '',
    adType: '',
    customAdDetails: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Update subject if URL param changes
    if (subjectParam) {
      setFormData((prev) => ({ ...prev, subject: subjectParam }));
    }
  }, [subjectParam]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Prepare payload, excluding empty optional fields
      const payload: any = {
        name: formData.name,
        email: formData.email,
        subject: formData.subject,
        message: formData.message,
      };

      // Only include adType if it has a value
      if (formData.adType) {
        payload.adType = formData.adType;
      }

      // Only include customAdDetails if it has a value
      if (formData.customAdDetails) {
        payload.customAdDetails = formData.customAdDetails;
      }

      const response = await axios.post('/api/contact', payload);

      if (response.data.success) {
        setSuccess(true);
        // Reset form
        setFormData({
          name: '',
          email: '',
          subject: 'general',
          message: '',
          adType: '',
          customAdDetails: '',
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('contact.errorSending', 'Error sending message'));
    } finally {
      setLoading(false);
    }
  };

  const subjectOptions = [
    { value: 'general', label: t('contact.subjects.general', 'General Inquiry') },
    { value: 'support', label: t('contact.subjects.support', 'Technical Support') },
    { value: 'complaint', label: t('contact.subjects.complaint', 'Complaint') },
    { value: 'advertising', label: t('contact.subjects.advertising', 'Request Advertising') },
    { value: 'other', label: t('contact.subjects.other', 'Other') },
  ];

  const adTypeOptions = [
    { value: 'model1', label: t('contact.adTypes.banner', 'Banner 3x1 (Premium) - $50/day') },
    { value: 'model2', label: t('contact.adTypes.sidebar', 'Sidebar 1x2 - $35/day') },
    { value: 'model3', label: t('contact.adTypes.card', 'Card 1x1 - $20/day') },
    { value: 'custom', label: t('contact.adTypes.custom', 'Custom (specify)') },
  ];

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t('contact.messageSent', 'Message Sent!')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('contact.messageSentDesc', 'We have received your message. We will get in touch with you soon.')}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/')}
              className="w-full px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors"
            >
              {t('contact.backToHome', 'Back to Home')}
            </button>
            <button
              onClick={() => {
                setSuccess(false);
                setFormData({
                  name: '',
                  email: '',
                  subject: 'general',
                  message: '',
                  adType: '',
                  customAdDetails: '',
                });
              }}
              className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
            >
              {t('contact.sendAnother', 'Send Another Message')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('contact.title', 'Contact Us')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('contact.subtitle', 'We are here to help. Fill out the form and we will get back to you soon.')}
          </p>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('contact.fullName', 'Full Name')} *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                maxLength={100}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder={t('contact.namePlaceholder', 'Your name')}
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('contact.email', 'Email')} *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder={t('contact.emailPlaceholder', 'you@email.com')}
              />
            </div>

            {/* Subject */}
            <div>
              <label
                htmlFor="subject"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('contact.subject', 'Subject')} *
              </label>
              <select
                id="subject"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {subjectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Ad Type (only if advertising subject) */}
            {formData.subject === 'advertising' && (
              <>
                <div>
                  <label
                    htmlFor="adType"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    {t('contact.adType', 'Ad Type')}
                  </label>
                  <select
                    id="adType"
                    name="adType"
                    value={formData.adType}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">{t('contact.selectType', 'Select a type')}</option>
                    {adTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom details if custom is selected */}
                {formData.adType === 'custom' && (
                  <div>
                    <label
                      htmlFor="customAdDetails"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                    >
                      {t('contact.customAdDetails', 'Custom Ad Space Details')}
                    </label>
                    <textarea
                      id="customAdDetails"
                      name="customAdDetails"
                      value={formData.customAdDetails}
                      onChange={handleChange}
                      maxLength={500}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                      placeholder={t('contact.customAdPlaceholder', 'Describe the size and features of the ad space you need...')}
                    />
                  </div>
                )}
              </>
            )}

            {/* Message */}
            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('contact.message', 'Message')} *
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                minLength={10}
                maxLength={2000}
                rows={6}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                placeholder={t('contact.messagePlaceholder', 'Write your message here...')}
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {formData.message.length}/2000 {t('contact.characters', 'characters')}
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                {error}
              </div>
            )}

            {/* Submit button */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                    {t('contact.sending', 'Sending...')}
                  </>
                ) : (
                  t('contact.sendMessage', 'Send Message')
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Additional info */}
        <div className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>
            {t('contact.alsoEmail', 'You can also send us an email at')}{' '}
            <a
              href="mailto:support@doapp.com"
              className="text-orange-500 hover:text-orange-600 font-medium"
            >
              support@doapp.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
