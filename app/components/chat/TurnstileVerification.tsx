import { AlertCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { type BoundTurnstileObject, Turnstile } from "react-turnstile";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

interface TurnstileVerificationProps {
  onVerified: (token: string) => void;
}

export function TurnstileVerification({ onVerified }: TurnstileVerificationProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const turnstileRef = useRef<BoundTurnstileObject | null>(null);

  const handleSuccess = useCallback(
    (token: string) => {
      setError(null);
      setIsLoading(false);
      onVerified(token);
    },
    [onVerified],
  );

  const handleError = useCallback(() => {
    setError("Verification failed. Please try again.");
    setIsLoading(false);
  }, []);

  const handleExpire = useCallback(() => {
    setError("Verification expired. Please verify again.");
    setIsLoading(false);
  }, []);

  const handleTimeout = useCallback(() => {
    setError("Verification timed out. Please try again.");
    setIsLoading(false);
  }, []);

  const handleLoad = useCallback((_widgetId: string, boundTurnstile: BoundTurnstileObject) => {
    turnstileRef.current = boundTurnstile;
    setIsLoading(false);
  }, []);

  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    turnstileRef.current?.reset();
  }, []);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "0x4AAAAAABs5lyUV9iomsdK2";

  if (!siteKey) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Configuration Error</AlertTitle>
        <AlertDescription>Turnstile site key is not configured. Please contact support.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="max-w-md mx-auto min-w-sm">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <CardTitle>Verify to Continue</CardTitle>
        <CardDescription>Complete the security check below to access the AI Chat Assistant.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {error ? (
          <Alert variant="destructive" className="w-full">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Verification Failed</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={handleRetry} className="w-fit">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className={error ? "opacity-50" : ""}>
          <Turnstile
            sitekey={siteKey}
            onSuccess={handleSuccess}
            onError={handleError}
            onExpire={handleExpire}
            onTimeout={handleTimeout}
            onLoad={handleLoad}
            theme="dark"
            size="normal"
          />
        </div>

        {isLoading && !error && <p className="text-sm text-muted-foreground">Loading verification...</p>}
      </CardContent>
    </Card>
  );
}
