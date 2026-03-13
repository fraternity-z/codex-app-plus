import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { GitBranchRef, GitDiffOutput, GitStatusOutput, GitStatusSnapshotOutput } from "../../../bridge/types";
import type { GitNotice } from "../model/types";
import type { GitDiffTarget } from "../model/workspaceGitHelpers";
import { composeGitStatus } from "../model/workspaceGitStatus";

interface RefBackedState<T> {
  readonly value: T;
  readonly ref: MutableRefObject<T>;
  readonly write: (nextValue: T) => void;
}

export interface WorkspaceGitState {
  readonly loading: boolean;
  readonly setLoading: (value: boolean) => void;
  readonly pendingAction: string | null;
  readonly setPendingAction: (value: string | null) => void;
  readonly snapshot: GitStatusSnapshotOutput | null;
  readonly snapshotRef: MutableRefObject<GitStatusSnapshotOutput | null>;
  readonly writeSnapshot: (nextSnapshot: GitStatusSnapshotOutput | null) => void;
  readonly branchRefs: ReadonlyArray<GitBranchRef>;
  readonly branchRefsRef: MutableRefObject<ReadonlyArray<GitBranchRef>>;
  readonly writeBranchRefs: (nextBranchRefs: ReadonlyArray<GitBranchRef>) => void;
  readonly branchRefsLoading: boolean;
  readonly setBranchRefsLoading: (value: boolean) => void;
  readonly branchRefsLoaded: boolean;
  readonly branchRefsLoadedRef: MutableRefObject<boolean>;
  readonly writeBranchRefsLoaded: (value: boolean) => void;
  readonly remoteUrl: string | null;
  readonly remoteUrlRef: MutableRefObject<string | null>;
  readonly writeRemoteUrl: (value: string | null) => void;
  readonly remoteUrlLoading: boolean;
  readonly setRemoteUrlLoading: (value: boolean) => void;
  readonly remoteUrlLoaded: boolean;
  readonly remoteUrlLoadedRef: MutableRefObject<boolean>;
  readonly writeRemoteUrlLoaded: (value: boolean) => void;
  readonly error: string | null;
  readonly setError: (value: string | null) => void;
  readonly notice: GitNotice | null;
  readonly setNotice: (value: GitNotice | null) => void;
  readonly commitMessage: string;
  readonly setCommitMessage: (value: string) => void;
  readonly selectedBranch: string;
  readonly selectedBranchRef: MutableRefObject<string>;
  readonly setSelectedBranch: (value: string) => void;
  readonly newBranchName: string;
  readonly setNewBranchName: (value: string) => void;
  readonly diff: GitDiffOutput | null;
  readonly setDiff: (value: GitDiffOutput | null) => void;
  readonly diffCache: Readonly<Record<string, GitDiffOutput>>;
  readonly diffCacheRef: MutableRefObject<Readonly<Record<string, GitDiffOutput>>>;
  readonly writeDiffCache: (value: Readonly<Record<string, GitDiffOutput>>) => void;
  readonly diffTarget: GitDiffTarget | null;
  readonly diffTargetRef: MutableRefObject<GitDiffTarget | null>;
  readonly writeDiffTarget: (value: GitDiffTarget | null) => void;
  readonly loadingDiffKeys: ReadonlyArray<string>;
  readonly loadingDiffKeysRef: MutableRefObject<ReadonlyArray<string>>;
  readonly writeLoadingDiffKeys: (value: ReadonlyArray<string>) => void;
  readonly staleDiffKeys: ReadonlyArray<string>;
  readonly staleDiffKeysRef: MutableRefObject<ReadonlyArray<string>>;
  readonly writeStaleDiffKeys: (value: ReadonlyArray<string>) => void;
  readonly requestIdRef: MutableRefObject<number>;
  readonly selectionIdRef: MutableRefObject<number>;
  readonly branchRefsRequestIdRef: MutableRefObject<number>;
  readonly remoteUrlRequestIdRef: MutableRefObject<number>;
  readonly previousRootRef: MutableRefObject<string | null>;
  readonly selectedRootRef: MutableRefObject<string | null>;
  readonly status: GitStatusOutput | null;
  readonly resetBranchRefsState: () => void;
  readonly resetRemoteUrlState: (loaded: boolean) => void;
  readonly resetRepositoryState: () => void;
  readonly clearTransientState: () => void;
}

function useRefBackedState<T>(initialValue: T): RefBackedState<T> {
  const [value, setValue] = useState(initialValue);
  const ref = useRef(initialValue);
  const write = useCallback((nextValue: T) => {
    ref.current = nextValue;
    setValue(nextValue);
  }, []);
  return { value, ref, write };
}

export function useWorkspaceGitState(selectedRootPath: string | null): WorkspaceGitState {
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const snapshotState = useRefBackedState<GitStatusSnapshotOutput | null>(null);
  const branchRefsState = useRefBackedState<ReadonlyArray<GitBranchRef>>([]);
  const [branchRefsLoading, setBranchRefsLoading] = useState(false);
  const branchRefsLoadedState = useRefBackedState(false);
  const remoteUrlState = useRefBackedState<string | null>(null);
  const [remoteUrlLoading, setRemoteUrlLoading] = useState(false);
  const remoteUrlLoadedState = useRefBackedState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<GitNotice | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const selectedBranchState = useRefBackedState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [diff, setDiff] = useState<GitDiffOutput | null>(null);
  const diffCacheState = useRefBackedState<Readonly<Record<string, GitDiffOutput>>>({});
  const diffTargetState = useRefBackedState<GitDiffTarget | null>(null);
  const loadingDiffKeysState = useRefBackedState<ReadonlyArray<string>>([]);
  const staleDiffKeysState = useRefBackedState<ReadonlyArray<string>>([]);
  const requestIdRef = useRef(0);
  const selectionIdRef = useRef(0);
  const branchRefsRequestIdRef = useRef(0);
  const remoteUrlRequestIdRef = useRef(0);
  const previousRootRef = useRef<string | null>(null);
  const selectedRootRef = useRef<string | null>(selectedRootPath);

  useEffect(() => {
    selectedRootRef.current = selectedRootPath;
  }, [selectedRootPath]);

  const resetBranchRefsState = useCallback(() => {
    branchRefsRequestIdRef.current += 1;
    branchRefsState.write([]);
    branchRefsLoadedState.write(false);
    setBranchRefsLoading(false);
  }, [branchRefsLoadedState.write, branchRefsState.write]);

  const resetRemoteUrlState = useCallback((loaded: boolean) => {
    remoteUrlRequestIdRef.current += 1;
    remoteUrlState.write(null);
    remoteUrlLoadedState.write(loaded);
    setRemoteUrlLoading(false);
  }, [remoteUrlLoadedState.write, remoteUrlState.write]);

  const resetRepositoryState = useCallback(() => {
    snapshotState.write(null);
    setError(null);
    setNotice(null);
    setDiff(null);
    diffCacheState.write({});
    diffTargetState.write(null);
    loadingDiffKeysState.write([]);
    staleDiffKeysState.write([]);
    resetBranchRefsState();
    resetRemoteUrlState(false);
  }, [
    diffCacheState.write,
    diffTargetState.write,
    loadingDiffKeysState.write,
    resetBranchRefsState,
    resetRemoteUrlState,
    snapshotState.write,
    staleDiffKeysState.write,
  ]);

  const clearTransientState = useCallback(() => {
    resetRepositoryState();
    setCommitMessage("");
    selectedBranchState.write("");
    setNewBranchName("");
  }, [resetRepositoryState, selectedBranchState.write]);

  const status = useMemo(
    () => composeGitStatus(
      snapshotState.value,
      branchRefsState.value,
      branchRefsLoadedState.value,
      remoteUrlState.value,
      remoteUrlLoadedState.value,
    ),
    [
      branchRefsLoadedState.value,
      branchRefsState.value,
      remoteUrlLoadedState.value,
      remoteUrlState.value,
      snapshotState.value,
    ],
  );

  return {
    loading,
    setLoading,
    pendingAction,
    setPendingAction,
    snapshot: snapshotState.value,
    snapshotRef: snapshotState.ref,
    writeSnapshot: snapshotState.write,
    branchRefs: branchRefsState.value,
    branchRefsRef: branchRefsState.ref,
    writeBranchRefs: branchRefsState.write,
    branchRefsLoading,
    setBranchRefsLoading,
    branchRefsLoaded: branchRefsLoadedState.value,
    branchRefsLoadedRef: branchRefsLoadedState.ref,
    writeBranchRefsLoaded: branchRefsLoadedState.write,
    remoteUrl: remoteUrlState.value,
    remoteUrlRef: remoteUrlState.ref,
    writeRemoteUrl: remoteUrlState.write,
    remoteUrlLoading,
    setRemoteUrlLoading,
    remoteUrlLoaded: remoteUrlLoadedState.value,
    remoteUrlLoadedRef: remoteUrlLoadedState.ref,
    writeRemoteUrlLoaded: remoteUrlLoadedState.write,
    error,
    setError,
    notice,
    setNotice,
    commitMessage,
    setCommitMessage,
    selectedBranch: selectedBranchState.value,
    selectedBranchRef: selectedBranchState.ref,
    setSelectedBranch: selectedBranchState.write,
    newBranchName,
    setNewBranchName,
    diff,
    setDiff,
    diffCache: diffCacheState.value,
    diffCacheRef: diffCacheState.ref,
    writeDiffCache: diffCacheState.write,
    diffTarget: diffTargetState.value,
    diffTargetRef: diffTargetState.ref,
    writeDiffTarget: diffTargetState.write,
    loadingDiffKeys: loadingDiffKeysState.value,
    loadingDiffKeysRef: loadingDiffKeysState.ref,
    writeLoadingDiffKeys: loadingDiffKeysState.write,
    staleDiffKeys: staleDiffKeysState.value,
    staleDiffKeysRef: staleDiffKeysState.ref,
    writeStaleDiffKeys: staleDiffKeysState.write,
    requestIdRef,
    selectionIdRef,
    branchRefsRequestIdRef,
    remoteUrlRequestIdRef,
    previousRootRef,
    selectedRootRef,
    status,
    resetBranchRefsState,
    resetRemoteUrlState,
    resetRepositoryState,
    clearTransientState,
  };
}
