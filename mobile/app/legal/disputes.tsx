import LegalDocument from '../../components/LegalDocument';
import { disputesEs } from '../../../shared/legal/disputes.es';
import { DISPUTES_KEYS } from '../../../shared/legal/disputes.structure';

/** Copy comes from shared/legal — the same source the web page reads. */
export default function DisputesScreen() {
  return <LegalDocument copy={disputesEs} keys={DISPUTES_KEYS} headerTitle="Resolución de Disputas" />;
}
