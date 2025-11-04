"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FcGoogle } from "react-icons/fc";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";


export function SigninPage() {
    const router = useRouter();

    const handleGoogleSignIn = async () => {
        try {
            const data = await authClient.signIn.social({
                provider: "google",
            });

            if (data?.error) {
                console.error("Error during sign-in:", data.error);
                toast.error("Google sign-in failed", {
                    description: data.error.message ?? "Something went wrong. Please try again.",
                });
            }
            router.push("/");
        } catch (err) {
            console.error("Unexpected sign-in error:", err);
            toast.error("Google sign-in error", {
                description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
            });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md shadow-xl border rounded-2xl">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold text-center">Welcome Back</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button
                        variant="outline"
                        className="w-full flex items-center gap-2"
                        onClick={handleGoogleSignIn}
                    >
                        <FcGoogle className="text-xl" /> Sign in with Google
                    </Button>

                    <Separator className="my-4" />

                    <p className="text-sm text-muted-foreground text-center mt-2">
                        Don&#39;t have an account?{" "}
                        <Link href="/signup" className="text-primary underline">
                            Sign up
                        </Link>
                    </p>
                </CardContent>
            </Card>


        </div>
    );
}