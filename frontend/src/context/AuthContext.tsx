import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, ApiError } from "../api/client";
import type { Student } from "../types/api";

interface AuthContextType {
  currentStudent: Student | null;
  login: (student: Student) => void;
  logout: () => void;
  isRegistered: boolean;
}

const STORAGE_KEY = "billshield_student";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentStudent, setCurrentStudent] = useState<Student | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Student) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((student: Student) => {
    setCurrentStudent(student);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(student));
    } catch (err) {
      console.error("Failed to save student to localStorage", err);
    }
  }, []);

  const logout = useCallback(() => {
    setCurrentStudent(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Failed to remove student from localStorage", err);
    }
  }, []);

  // Reconcile persisted demo registration with backend database on startup.
  // Clears stale localStorage only if backend confirms the record does not exist (404).
  useEffect(() => {
    if (!currentStudent?.id) return;
    let isCurrent = true;
    api.students
      .get(currentStudent.id)
      .then((fresh) => {
        if (isCurrent) {
          if (
            fresh.room_id !== currentStudent.room_id ||
            fresh.name !== currentStudent.name ||
            fresh.roll_number !== currentStudent.roll_number
          ) {
            login(fresh);
          }
        }
      })
      .catch((err: unknown) => {
        if (isCurrent && err instanceof ApiError && err.status === 404) {
          logout();
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [currentStudent?.id, login, logout]);

  return (
    <AuthContext.Provider
      value={{
        currentStudent,
        login,
        logout,
        isRegistered: currentStudent !== null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
