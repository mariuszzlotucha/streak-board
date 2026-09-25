import { useState } from "react";
import { Mail, Lock, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CellProps {
  title: string;
  description: string;
  email?: string;
  password?: string;
  emailError?: string;
  passwordError?: string;
  serverError?: string;
  pending?: boolean;
}

function StateCell({
  title,
  description,
  email: initialEmail = "",
  password: initialPassword = "",
  emailError,
  passwordError,
  serverError,
  pending = false,
}: CellProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [showPassword, setShowPassword] = useState(false);
  const slug = title.toLowerCase().replace(/\s+/g, "-");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
          }}
          noValidate
        >
          <FormField
            id={`${slug}-email`}
            type="email"
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            error={emailError}
            icon={<Mail className="size-4" />}
          />
          <FormField
            id={`${slug}-password`}
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={setPassword}
            placeholder="Your password"
            error={passwordError}
            icon={<Lock className="size-4" />}
            endContent={
              <PasswordToggle
                visible={showPassword}
                onToggle={() => {
                  setShowPassword(!showPassword);
                }}
              />
            }
          />
          <ServerError message={serverError} />
          <SubmitButton pending={pending} pendingText="Signing in..." icon={<LogIn className="size-4" />}>
            Sign in
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function DisabledCell() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Disabled</CardTitle>
        <CardDescription>Inputs and button disabled</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="disabled-email" className="mb-1.5">
              Email
            </Label>
            <Input id="disabled-email" type="email" placeholder="you@example.com" disabled />
          </div>
          <div>
            <Label htmlFor="disabled-password" className="mb-1.5">
              Password
            </Label>
            <Input id="disabled-password" type="password" placeholder="Your password" disabled />
          </div>
          <Button type="button" className="w-full" disabled>
            <LogIn />
            Sign in
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SignInStates() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <StateCell title="Default" description="Filled in" email="jane@example.com" password="correct-horse" />
      <StateCell title="Empty" description="Placeholders, nothing typed" />
      <StateCell
        title="Field error"
        description="Client-side validation"
        email="not-an-email"
        emailError="Enter a valid email address"
        passwordError="Password is required"
      />
      <StateCell
        title="Server error"
        description="Alert from a known error code"
        email="jane@example.com"
        password="wrong-password"
        serverError="Invalid email or password."
      />
      <DisabledCell />
      <StateCell
        title="Loading"
        description="Submit pending"
        email="jane@example.com"
        password="correct-horse"
        pending
      />
    </div>
  );
}
