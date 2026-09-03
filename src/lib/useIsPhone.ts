import { useEffect, useState } from 'react';

const QUERY = '(max-width: 700px)';

/** 幅の狭い端末では、道具を下から出すシートに畳む */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isPhone;
}
