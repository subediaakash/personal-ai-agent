"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FcGoogle } from "react-icons/fc";
import { authClient } from "@/lib/auth-client";
import { Toaster, toast } from "sonner";
import { useRouter } from "next/navigation";

export function SignupPage() {
    const router = useRouter();

    const handleGoogleSignUp = async () => {
        try {
            const data = await authClient.signIn.social({
                provider: "google",
            });

            if (data?.error) {
                console.error("Error during sign-up:", data.error);
                toast.error("Google sign-up failed", {
                    description: data.error.message ?? "Something went wrong. Please try again.",
                });
                return;
            }

            router.push("/");
        } catch (err) {
            console.error("Unexpected sign-up error:", err);
            toast.error("Google sign-up error", {
                description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
            });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md shadow-xl border rounded-2xl">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold text-center">Create Account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button
                        variant="outline"
                        className="w-full flex items-center gap-2"
                        onClick={handleGoogleSignUp}
                    >
                        <FcGoogle className="text-xl" /> Sign up with Google
                    </Button>

                    <Separator className="my-4" />

                    <p className="text-sm text-muted-foreground text-center mt-2">
                        Already have an account?{" "}
                        <Link href="/signin" className="text-primary underline">Sign in</Link>
                    </p>
                </CardContent>
            </Card>

            <Toaster position="top-right" richColors />
        </div>
    );
}

