import { useState, useEffect } from "react";
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

  const setStartDate = (date: Date) => {
    setStartDateState(date);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("from", format(date, "yyyy-MM-dd"));
    setSearchParams(newParams, { replace: true });
  };

  const setEndDate = (date: Date) => {
    setEndDateState(date);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("to", format(date, "yyyy-MM-dd"));
    setSearchParams(newParams, { replace: true });
  };

  useEffect(() => {
    if (fromParam) {
      const parsed = parseISO(fromParam);
      if (isValid(parsed) && parsed.getTime() !== startDate.getTime()) {
        setStartDateState(parsed);
      }
    }
    if (toParam) {
      const parsed = parseISO(toParam);
      if (isValid(parsed) && parsed.getTime() !== endDate.getTime()) {
        setEndDateState(parsed);
      }
    }
  }, [fromParam, toParam]);

  return { startDate, endDate, setStartDate, setEndDate };
}
