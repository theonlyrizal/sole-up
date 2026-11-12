"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icons/icon";
import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/shell/page-header";
import {
  ActionConfirmation,
  type ConfirmationPhase,
} from "@/components/ui/action-confirmation";
import { Badge } from "@/components/ui/badge";
import { BottomSheet, ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorReference } from "@/components/ui/error-reference";
import { ErrorState } from "@/components/ui/error-state";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Input } from "@/components/ui/input";
import { ListGroup, ListItem } from "@/components/ui/list";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SaveStatus } from "@/components/ui/save-status";
import { Select } from "@/components/ui/select";
import { LoadingState, Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { fail } from "@/lib/result";

type Theme = "light" | "dark";
const pageWidths = [
  { value: "overview", label: "Overview" },
  { value: "detail", label: "Detail" },
  { value: "reading", label: "Reading" },
] as const;

export function SurfaceExamples({
  theme,
  onToast,
}: {
  theme: Theme;
  onToast: () => void;
}) {
  const [selected, setSelected] = useState("Write an outline");
  const [notice, setNotice] = useState("");
  const [width, setWidth] =
    useState<(typeof pageWidths)[number]["value"]>("reading");
  const sectionId = `${theme}-surfaces`;
  return (
    <section aria-labelledby={sectionId} className="grid min-w-0 gap-4">
      <h3 id={sectionId} className="text-title-large-emphasized">
        Containment and feedback
      </h3>
      <div className="grid min-w-0 gap-3">
        <Card variant="hero">
          <CardHeader
            title="Next commitment"
            icon="calendar_month"
            size="l"
            headingLevel={4}
          />
          <p className="my-3 text-body-large">
            Review your workshop notes at 14:30.
          </p>
          <Button
            icon="calendar_month"
            className="feature-action"
            onClick={() => setNotice("Workshop notes opened.")}
          >
            Open calendar
          </Button>
        </Card>
        <Card as="article">
          <CardHeader
            title="Weekly plan"
            href={`#${theme}-page-frame`}
            icon="checklist"
            headingLevel={4}
            actions={<PreviewMenu onSelect={setNotice} />}
          />
          <p className="mt-2 text-body-medium text-on-surface-variant">
            Three tasks are ready to schedule.
          </p>
        </Card>
        <Card variant="tonal">
          <CardHeader title="Workshop checklist" headingLevel={4} />
          <Disclosure title="Show history">
            <p className="px-3 pb-3 text-body-medium">
              You added the first task on Tuesday.
            </p>
          </Disclosure>
          <Disclosure defaultOpen title="More options">
            <Button
              variant="text"
              onClick={() => setNotice("Checklist shared in the preview.")}
            >
              Preview sharing
            </Button>
          </Disclosure>
        </Card>
        <Card variant="outlined">
          <CardHeader title="Preparation" headingLevel={4} />
          <p className="mt-2 text-body-medium text-on-surface-variant">
            Set aside twenty minutes to read the brief.
          </p>
        </Card>
      </div>
      <ListGroup label="Workshop tasks">
        <ListItem
          headline="Read the brief"
          href={`#${theme}-page-frame`}
          leading={
            <Checkbox
              shape="round"
              label="Mark brief as read"
              className="size-12 [&>label]:sr-only"
            />
          }
          trailing={
            <PreviewMenu
              label="Actions for Read the brief"
              onSelect={setNotice}
            />
          }
        />
        <ListItem
          headline="Write an outline"
          supporting="Workshop preparation"
          meta="17:00"
          selected={selected === "Write an outline"}
          onClick={() => setSelected("Write an outline")}
        />
        <ListItem
          headline="Pack materials"
          supporting="Print the outline and set aside the markers, blank cards and spare notebooks."
          lines={3}
          selected={selected === "Pack materials"}
          onClick={() => setSelected("Pack materials")}
        />
      </ListGroup>
      <ListGroup label="One task">
        <ListItem headline="Check the room" />
      </ListGroup>
      <Example title="Dialogs, sheets and menus">
        <div className="flex flex-wrap items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outlined">Open dialog</Button>
            </DialogTrigger>
            <DialogContent
              title="Workshop details"
              description="Thursday at 14:30."
            >
              <p className="text-body-medium">Meet in the upstairs studio.</p>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outlined">Open wide dialog</Button>
            </DialogTrigger>
            <DialogContent size="l" title="Workshop agenda">
              <p className="text-body-medium">
                Review the brief, then sketch an outline together.
              </p>
            </DialogContent>
          </Dialog>
          <FormExample theme={theme} onSave={setNotice} />
          <ConfirmExample onFinish={setNotice} />
          <ConfirmDialog
            title="Archive the outline?"
            description="You can restore the outline from the archive."
            trigger={<Button variant="text">Archive preview</Button>}
            confirmLabel="Archive"
            destructive={false}
            icon="archive"
            onConfirm={() => setNotice("Outline archived in the preview.")}
          />
          <BottomSheet
            title="Workshop options"
            trigger={<Button variant="tonal">Open bottom sheet</Button>}
            description="Choose where to keep the workshop outline."
          >
            <Button
              variant="text"
              icon="archive"
              onClick={() => setNotice("Archive selected in the preview.")}
            >
              Archive outline
            </Button>
          </BottomSheet>
          <ResponsiveSheet
            title="Attachment options"
            anchor={<Button variant="tonal">Open anchored sheet</Button>}
          >
            <p className="text-body-medium">
              Attach the outline to the workshop note.
            </p>
          </ResponsiveSheet>
          <ResponsiveSheet
            title="Workshop information"
            trigger={<Button variant="tonal">Open responsive sheet</Button>}
          >
            <p className="text-body-medium">The room seats eight people.</p>
          </ResponsiveSheet>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outlined">Open popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <PopoverTitle className="text-title-medium">
                Workshop location
              </PopoverTitle>
              <PopoverDescription className="text-body-medium">
                Upstairs studio
              </PopoverDescription>
              <PopoverClose asChild>
                <Button variant="text">Done</Button>
              </PopoverClose>
            </PopoverContent>
          </Popover>
          <PreviewMenu onSelect={setNotice} label="Workshop menu" />
          <Tooltip label="The local time of your next workshop">
            <IconButton
              icon="info"
              label="About workshop time"
              tooltip={false}
            />
          </Tooltip>
        </div>
        <p role="status" className="text-body-medium text-on-surface-variant">
          {notice}
        </p>
      </Example>
      <Example title="Snackbar">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outlined"
            onClick={() => {
              onToast();
              toast({ title: "Workshop starts at 14:30." });
            }}
          >
            Show information
          </Button>
          <Button
            variant="tonal"
            onClick={() => {
              onToast();
              toast({
                title: "Outline archived.",
                variant: "success",
                action: {
                  label: "Undo",
                  altText: "Restore the outline from the archive",
                  onClick: () => toast({ title: "Outline restored." }),
                },
              });
            }}
          >
            Show snackbar with action
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              onToast();
              toast({
                title: "Could not refresh the preview.",
                variant: "error",
              });
            }}
          >
            Show error snackbar
          </Button>
        </div>
      </Example>
      <StateExamples />
      <ConfirmationExamples theme={theme} />
      <Example title="Page container and header">
        <FormField id={`${theme}-page-width`} label="Container width">
          {(control) => (
            <Select
              {...control}
              value={width}
              onChange={(event) => {
                const next = pageWidths.find(
                  (item) => item.value === event.currentTarget.value,
                );
                if (next) setWidth(next.value);
              }}
            >
              {pageWidths.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <PageContainer
          width={width}
          className="rounded-lg bg-surface-container"
        >
          <PageHeader
            headingLevel={4}
            title="Workshop plan"
            description="Prepare the outline and share it with the team."
            eyebrow="Planning"
            back={{ href: `#${sectionId}`, label: "All plans" }}
            actions={
              <Button
                icon="edit"
                onClick={() => setNotice("Workshop plan opened for editing.")}
              >
                Edit plan
              </Button>
            }
            subnav={
              <Tabs
                mode="link"
                label="Workshop plan"
                items={[
                  {
                    value: "overview",
                    label: "Plan",
                    href: `#${theme}-page-frame`,
                  },
                  { value: "tasks", label: "Tasks", href: `#${sectionId}` },
                ]}
                value="overview"
              />
            }
          />
          <p id={`${theme}-page-frame`} className="pt-4 text-body-medium">
            The outline is ready for your review.
          </p>
        </PageContainer>
      </Example>
    </section>
  );
}

function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="grid gap-3">
      <CardHeader title={title} headingLevel={4} />
      {children}
    </Card>
  );
}

function PreviewMenu({
  label = "Weekly plan actions",
  onSelect,
}: {
  label?: string;
  onSelect: (message: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon="more_vert" label={label} tooltip={false} />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem
          icon="edit"
          onSelect={() => onSelect("Edit selected in the preview.")}
        >
          Edit
        </MenuItem>
        <MenuItem
          icon="archive"
          shortcut="A"
          onSelect={() => onSelect("Archive selected in the preview.")}
        >
          Archive
        </MenuItem>
        <MenuItem disabled>Move to another plan</MenuItem>
        <MenuItem
          destructive
          icon="delete"
          onSelect={() => onSelect("Delete selected in the preview.")}
        >
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function FormExample({
  theme,
  onSave,
}: {
  theme: Theme;
  onSave: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);
  const formId = `${theme}-workshop-form`;
  return (
    <FormDialog
      title="Edit workshop"
      description="Change the workshop details."
      trigger={<Button>Edit workshop form</Button>}
      open={open}
      onOpenChange={setOpen}
      formId={formId}
      submitLabel="Save workshop"
      pending={pending}
      destructive={
        <Button
          variant="danger-text"
          icon="delete"
          onClick={() => onSave("Delete selected in the preview.")}
        >
          Delete workshop
        </Button>
      }
    >
      <form
        id={formId}
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          setPending(true);
          setError(false);
          setTimeout(() => {
            setPending(false);
            if (attempt === 0) {
              setAttempt(1);
              setError(true);
            } else {
              onSave("Workshop details saved in the preview.");
              setOpen(false);
            }
          }, 650);
        }}
      >
        {[
          ["Title", "Workshop"],
          ["Location", "Upstairs studio"],
          ["Start time", "14:30"],
          ["End time", "16:00"],
          ["Host", "Alex"],
          ["Materials", "Cards, markers and notebooks"],
          ["Access", "Use the east entrance"],
        ].map(([label, value], index) => (
          <FormField key={label} id={`${formId}-${index}`} label={label!}>
            {(control) => (
              <Input {...control} name={label} defaultValue={value} required />
            )}
          </FormField>
        ))}
        <FormField id={`${formId}-notes`} label="Notes">
          {(control) => (
            <Textarea
              {...control}
              name="notes"
              rows={4}
              defaultValue="Bring a copy of the outline."
            />
          )}
        </FormField>
        <FormError
          error={
            error
              ? {
                  code: "INTERNAL",
                  message:
                    "The preview could not save. Your changes are still here.",
                }
              : null
          }
        />
      </form>
    </FormDialog>
  );
}

function ConfirmExample({ onFinish }: { onFinish: (message: string) => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <ConfirmDialog
      title="Delete the workshop?"
      description="This removes the workshop from this preview."
      trigger={<Button variant="danger-text">Delete preview</Button>}
      confirmLabel="Delete workshop"
      onConfirm={async () => {
        await new Promise((resolve) => setTimeout(resolve, 750));
        if (!failed) {
          setFailed(true);
          return fail({
            code: "CONFLICT",
            message: "The preview could not delete the workshop. Try again.",
          });
        }
        onFinish("Workshop deleted in the preview.");
      }}
    />
  );
}

function StateExamples() {
  const [savePhase, setSavePhase] = useState<"error" | "saving" | "saved">(
    "error",
  );
  const [retry, setRetry] = useState(false);
  return (
    <>
      <Example title="Loading indicator, skeleton and loading state">
        <div className="flex flex-wrap items-center gap-4">
          <LoadingIndicator size={24} label="Loading notes" />
          <LoadingIndicator
            size={38}
            label="Loading workshop details"
            contained
          />
          <LoadingIndicator />
        </div>
        <Skeleton shape="card" className="h-24 w-full" />
        <Skeleton shape="list-item" className="h-14 w-full" />
        <div className="flex items-center gap-3">
          <Skeleton shape="circle" className="size-10 shrink-0" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <LoadingState label="Loading workshop notes" />
      </Example>
      <Example title="Empty and error states">
        <EmptyState
          headingLevel={4}
          title="No workshop notes"
          description="Keep the outline and materials together in one note."
          art={{ icon: "note_add" }}
          action={<Button variant="tonal">New note</Button>}
        />
        <EmptyState
          compact
          headingLevel={4}
          title="No upcoming workshops"
          art={{ icon: "calendar_month", shape: "arch" }}
          action={<Button variant="text">Open calendar</Button>}
        />
        <EmptyState headingLevel={4} title="No archived workshops" />
        {retry ? (
          <InlineBanner tone="success" title="Workshops loaded">
            Your next workshop is at 14:30.
          </InlineBanner>
        ) : (
          <ErrorState
            headingLevel={3}
            title="Workshops couldn’t load"
            description={
              <>
                Try again to load your workshops.
                <ErrorReference id="preview-7E92" />
              </>
            }
            onRetry={() => setRetry(true)}
          />
        )}
      </Example>
      <Example title="Inline banner, form error and save status">
        <InlineBanner tone="info" title="Sharing options">
          Only people you invite can see the outline.
        </InlineBanner>
        <InlineBanner
          tone="warning"
          title="Calendar disconnected"
          action={<Button variant="text">Reconnect</Button>}
        >
          Reconnect to see upcoming workshops.
        </InlineBanner>
        <InlineBanner tone="error" title="Schedule conflict">
          The studio is reserved at 14:30.
        </InlineBanner>
        <InlineBanner tone="success" title="Calendar connected">
          Upcoming workshops are available.
        </InlineBanner>
        <FormError
          error={{
            code: "VALIDATION",
            message: "Check the workshop details.",
            fieldErrors: {},
            formErrors: ["End time must be after start time."],
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <SaveStatus phase="saving" />
          <SaveStatus phase="saved" />
          <SaveStatus
            phase={savePhase}
            onRetry={() => {
              setSavePhase("saving");
              setTimeout(() => setSavePhase("saved"), 650);
            }}
          />
        </div>
      </Example>
      <Example title="Badge">
        <div className="flex flex-wrap items-center gap-4 text-body-medium">
          <span className="flex items-center gap-2">
            Updates <Badge label="New updates" />
          </span>
          <span className="flex items-center gap-2">
            Inbox <Badge count={3} label="3 inbox tasks" />
          </span>
        </div>
      </Example>
    </>
  );
}

const confirmationSamples: {
  label: string;
  phase: ConfirmationPhase;
  status: string;
}[] = [
  { label: "Idle", phase: "idle", status: "Ready to log" },
  { label: "Slow pending", phase: "pending", status: "Saving 2 cups…" },
  { label: "Confirmed", phase: "confirmed", status: "3 of 3 cups saved" },
  {
    label: "Partial quantity",
    phase: "confirmed",
    status: "2 of 3 cups saved",
  },
  {
    label: "Failure",
    phase: "error",
    status: "Could not save. Retry is available.",
  },
  { label: "Retry", phase: "pending", status: "Retrying 2 cups…" },
  {
    label: "Correction",
    phase: "confirmed",
    status: "Corrected to 1 of 3 cups",
  },
  {
    label: "Repeated result",
    phase: "confirmed",
    status: "2 of 3 cups already saved",
  },
  { label: "Reduced motion", phase: "confirmed", status: "2 of 3 cups saved" },
];

function ConfirmationExamples({ theme }: { theme: Theme }) {
  const [preview, setPreview] = useState<{
    phase: ConfirmationPhase;
    amount: number;
    status: string;
    key?: number;
    revision: number;
  }>({
    phase: "idle",
    amount: 0,
    status: "Ready to log 2 cups.",
    revision: 0,
  });
  const pending = preview.phase === "pending";
  function begin() {
    setPreview((current) => ({
      ...current,
      phase: "pending",
      status: current.phase === "error" ? "Retrying 2 cups…" : "Saving 2 cups…",
    }));
  }

  return (
    <section
      aria-labelledby={`${theme}-confirmation-title`}
      className="grid gap-4"
    >
      <Card variant="tonal" className="grid gap-4">
        <CardHeader
          id={`${theme}-confirmation-title`}
          title="Action confirmation"
          headingLevel={4}
          icon="task_alt"
        />
        <ul className="grid gap-0.5">
          {confirmationSamples.map(({ label, phase, status }) => (
            <li
              key={label}
              className="flex flex-wrap items-center gap-2 rounded-xs bg-resting-surface p-2 text-on-resting-surface"
            >
              <ActionConfirmation
                phase={phase}
                confirmationKey={phase === "confirmed" ? 1 : undefined}
              >
                <Icon name="add" size={20} />
              </ActionConfirmation>
              <div className="min-w-0 flex-1">
                <div className="text-title-small">{label}</div>
                <p className="text-body-medium text-on-surface-variant">
                  {status}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div role="group" aria-label="Try logging water" className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="tonal"
              aria-busy={pending || undefined}
              aria-disabled={pending || undefined}
              onClick={() => {
                if (!pending) begin();
              }}
            >
              <ActionConfirmation
                phase={preview.phase}
                confirmationKey={preview.key}
              >
                <Icon name="add" size={20} />
              </ActionConfirmation>
              Log 2 cups
            </Button>
            <p role="status" aria-live="polite" className="text-body-medium">
              {preview.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="text"
              disabled={!pending}
              onClick={() =>
                setPreview((current) => ({
                  ...current,
                  phase: "error",
                  status: "Could not save 2 cups. Retry is available.",
                }))
              }
            >
              Resolve with error
            </Button>
            <Button
              variant="text"
              disabled={!pending}
              onClick={() =>
                setPreview((current) => {
                  const repeated = current.amount === 2;
                  const revision = repeated
                    ? current.revision
                    : current.revision + 1;
                  return {
                    phase: "confirmed",
                    revision,
                    key: revision,
                    amount: 2,
                    status: repeated
                      ? "2 of 3 cups already saved."
                      : "2 of 3 cups saved.",
                  };
                })
              }
            >
              Resolve save
            </Button>
            <Button
              variant="text"
              disabled={preview.phase !== "error"}
              onClick={begin}
            >
              Retry log
            </Button>
            <Button
              variant="text"
              disabled={preview.phase !== "confirmed" || preview.amount !== 2}
              onClick={() =>
                setPreview((current) => ({
                  ...current,
                  phase: "confirmed",
                  key: undefined,
                  amount: 1,
                  status: "Corrected to 1 of 3 cups.",
                }))
              }
            >
              Correct to 1 cup
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
