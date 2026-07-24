import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { format, subDays, parseISO, isValid } from "date-fns";

export function useUrlDateRange(defaultDaysBack = 6) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const [startDate, setStartDateState] = useState<Date>(() => {
    if (fromParam) {
      const parsed = parseISO(fromParam);
      if (isValid(parsed)) return parsed;
    }
    return subDays(new Date(), defaultDaysBack);
  });

  const [endDate, setEndDateState] = useState<Date>(() => {
    if (toParam) {
      const parsed = parseISO(toParam);
      if (isValid(parsed)) return parsed;
    }
    return new Date();
  });

  const setStartDate = useCallback((date: Date) => {
    if (!date || !isValid(date)) return;
    setStartDateState(date);
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("from", format(date, "yyyy-MM-dd"));
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  const setEndDate = useCallback((date: Date) => {
    if (!date || !isValid(date)) return;
    setEndDateState(date);
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("to", format(date, "yyyy-MM-dd"));
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (fromParam) {
      const parsed = parseISO(fromParam);
      if (isValid(parsed)) {
        setStartDateState((prev) => {
          if (!prev || !isValid(prev)) return parsed;
          return format(prev, "yyyy-MM-dd") !== format(parsed, "yyyy-MM-dd") ? parsed : prev;
        });
      }
    }
    if (toParam) {
      const parsed = parseISO(toParam);
      if (isValid(parsed)) {
        setEndDateState((prev) => {
          if (!prev || !isValid(prev)) return parsed;
          return format(prev, "yyyy-MM-dd") !== format(parsed, "yyyy-MM-dd") ? parsed : prev;
        });
      }
    }
  }, [fromParam, toParam]);

  return { startDate, endDate, setStartDate, setEndDate };
}
