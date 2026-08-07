import LegalDocument from '../../components/LegalDocument';
import { cookiesEs } from '../../../shared/legal/cookies.es';
import { COOKIES_KEYS } from '../../../shared/legal/cookies.structure';

/** Copy comes from shared/legal — the same source the web page reads. */
export default function CookiesScreen() {
  return <LegalDocument copy={cookiesEs} keys={COOKIES_KEYS} headerTitle="Política de Cookies" />;
}
