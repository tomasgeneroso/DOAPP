import LegalDocument from '../../components/LegalDocument';
import { privacyEs } from '../../../shared/legal/privacy.es';
import { PRIVACY_KEYS } from '../../../shared/legal/privacy.structure';

/** Copy comes from shared/legal — the same source the web page reads. */
export default function PrivacyScreen() {
  return <LegalDocument copy={privacyEs} keys={PRIVACY_KEYS} headerTitle="Política de Privacidad" />;
}
