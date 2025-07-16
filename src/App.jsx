// src/App.jsx


import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs } from 'firebase/firestore'; // Added getDocs

// --- Firebase Configuration and Initialization ---

const firebaseConfig = {
  apiKey: "AIzaSyBgeA3V4Od6dQROkX2rbaK4Oi3nKidNelg",
  authDomain: "project-manager-e550f.firebaseapp.com",
  databaseURL: "https://project-manager-e550f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "project-manager-e550f",
  storageBucket: "project-manager-e550f.firebasestorage.app",
  messagingSenderId: "214625929654",
  appId: "1:214625929654:web:c0aba18d332dd32b175917"
};

// Use the projectId from  firebaseConfig as the appId for Firestore paths
// This is crucial for the security rules and data structure defined.
const appId = firebaseConfig.projectId;


const initialAuthToken = null; // Set to null for self-implementation

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Contexts for Global State ---
const AuthContext = createContext(null);
const ProjectContext = createContext(null);

// --- Helper Components ---

const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-screen bg-gray-50">
    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
    <p className="ml-4 text-xl text-gray-700">Loading...</p>
  </div>
);

const ToastNotification = ({ message, type, onClose }) => {
  const bgColor = type === 'success' ? 'bg-green-500' : 'bg-blue-500';
  const textColor = 'text-white';
  const borderColor = type === 'success' ? 'border-green-700' : 'border-blue-700';

  return (
    <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg flex items-center ${bgColor} ${textColor} border-b-4 ${borderColor} animate-fade-in-up z-50`}>
      <span className="mr-3">
        {type === 'success' ? '✅' : '🔔'}
      </span>
      <p className="font-semibold">{message}</p>
      <button onClick={onClose} className="ml-auto text-white hover:text-gray-200">
        &times;
      </button>
    </div>
  );
};

// --- Auth Provider ---
const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setUserId(user.uid);
        console.log('User logged in:', user.uid);
      } else {
        console.log('No user logged in. Attempting anonymous sign-in or custom token...');
        if (initialAuthToken) {
          try {
            const userCredential = await signInWithCustomToken(auth, initialAuthToken);
            setCurrentUser(userCredential.user);
            setUserId(userCredential.user.uid);
            console.log('Signed in with custom token:', userCredential.user.uid);
          } catch (error) {
            console.error('Error signing in with custom token:', error);
            // Fallback to anonymous if custom token fails or is not provided
            try {
              const userCredential = await signInAnonymously(auth);
              setCurrentUser(userCredential.user);
              setUserId(userCredential.user.uid);
              console.log('Signed in anonymously:', userCredential.user.uid);
            } catch (anonError) {
              console.error('Error signing in anonymously:', anonError);
            }
          }
        } else {
          // Default to anonymous sign-in if no custom token is provided
          try {
            const userCredential = await signInAnonymously(auth);
            setCurrentUser(userCredential.user);
            setUserId(userCredential.user.uid);
            console.log('Signed in anonymously:', userCredential.user.uid);
          } catch (anonError) {
            console.error('Error signing in anonymously:', anonError);
          }
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <AuthContext.Provider value={{ currentUser, userId }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Project Provider ---
const ProjectProvider = ({ children }) => {
  const { userId } = useContext(AuthContext);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoadingProjects(false);
      return;
    }

    const projectsRef = collection(db, `artifacts/${appId}/public/data/projects`);
    const q = query(projectsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedProjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(fetchedProjects);
      setLoadingProjects(false);
      console.log("Projects updated:", fetchedProjects.length);
    }, (error) => {
      console.error("Error fetching projects:", error);
      setLoadingProjects(false);
    });

    return () => unsubscribe();
  }, [userId]);

  if (loadingProjects) {
    return <LoadingSpinner />;
  }

  return (
    <ProjectContext.Provider value={{ projects, selectedProject, setSelectedProject }}>
      {children}
    </ProjectContext.Provider>
  );
};

// --- Main App Component ---
const App = () => {
  const { userId } = useContext(AuthContext);
  const { selectedProject, setSelectedProject } = useContext(ProjectContext);
  const [toast, setToast] = useState(null);
  const [lastCommentTimestamp, setLastCommentTimestamp] = useState({}); // To track last comment per task

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  // Real-time comment notifications
  useEffect(() => {
    if (!selectedProject || !userId) return;

    const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${selectedProject.id}/tasks`);
    const unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                const task = { id: change.doc.id, ...change.doc.data() };
                const commentsRef = collection(db, `artifacts/${appId}/public/data/projects/${selectedProject.id}/tasks/${task.id}/comments`);
                const qComments = query(commentsRef, orderBy('createdAt', 'desc'), limit(1)); // Listen for the latest comment

                const unsubscribeComments = onSnapshot(qComments, (commentSnapshot) => {
                    if (!commentSnapshot.empty) {
                        const latestComment = { id: commentSnapshot.docs[0].id, ...commentSnapshot.docs[0].data() };
                        if (latestComment.userId !== userId) { // Only show if not my own comment
                            const commentTime = latestComment.createdAt?.toDate().getTime();
                            const knownLastTime = lastCommentTimestamp[task.id] || 0;

                            if (commentTime && commentTime > knownLastTime) {
                                setLastCommentTimestamp(prev => ({ ...prev, [task.id]: commentTime }));
                                showToast(`New comment on task "${task.title}" by ${latestComment.userName || 'Someone'}`, 'info');
                            }
                        }
                    }
                }, (error) => {
                    console.error("Error listening for comments on task", task.id, ":", error);
                });

                // Store unsubscribe function to clean up when component unmounts or task changes
                return () => unsubscribeComments();
            }
        });
    }, (error) => {
        console.error("Error listening for tasks for comment notifications:", error);
    });

    return () => unsubscribeTasks();
}, [selectedProject, userId, showToast, lastCommentTimestamp]); // Add lastCommentTimestamp to dependencies

  return (
    <div className="min-h-screen bg-gray-100 font-inter antialiased">
      <header className="bg-white shadow-sm p-4 flex justify-between items-center z-10 sticky top-0">
        <h1 className="text-2xl font-bold text-gray-800">Project Manager</h1>
        <div className="text-gray-600 text-sm">
          User ID: <span className="font-semibold text-indigo-600">{userId || 'N/A'}</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {selectedProject ? (
          <ProjectBoard project={selectedProject} onBack={() => setSelectedProject(null)} showToast={showToast} />
        ) : (
          <ProjectList showToast={showToast} />
        )}
      </main>

      {toast && (
        <ToastNotification
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

// --- Root Component (Wrapper for Providers) ---
// This component acts as the main entry point for rendering the app,
// providing the necessary contexts to its children.
const Root = () => (
  <AuthProvider>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </AuthProvider>
);


// --- ProjectList Component ---
const ProjectList = ({ showToast }) => {
  const { projects, setSelectedProject } = useContext(ProjectContext);
  const { userId } = useContext(AuthContext);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      showToast("Project name cannot be empty.", "info");
      return;
    }
    setCreatingProject(true);
    try {
      const projectsRef = collection(db, `artifacts/${appId}/public/data/projects`);
      await addDoc(projectsRef, {
        name: newProjectName.trim(),
        description: newProjectDescription.trim(),
        createdAt: serverTimestamp(),
        createdBy: userId,
        members: [userId] // Creator is default member
      });
      setNewProjectName('');
      setNewProjectDescription('');
      showToast("Project created successfully!", "success");
    } catch (error) {
      console.error("Error creating project:", error);
      showToast("Error creating project.", "error"); // Use 'error' type for toast
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    <div className="animate-fade-in-up bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-3xl font-bold text-gray-800 mb-6">Your Projects</h2>

      <form onSubmit={handleCreateProject} className="mb-8 p-6 bg-indigo-50 rounded-lg shadow-inner">
        <h3 className="text-xl font-semibold text-indigo-800 mb-4">Create New Project</h3>
        <div className="mb-4">
          <label htmlFor="projectName" className="block text-gray-700 text-sm font-bold mb-2">Project Name:</label>
          <input
            type="text"
            id="projectName"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="e.g., My Awesome Product Launch"
            disabled={creatingProject}
            required
          />
        </div>
        <div className="mb-6">
          <label htmlFor="projectDescription" className="block text-gray-700 text-sm font-bold mb-2">Description:</label>
          <textarea
            id="projectDescription"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500 h-24 resize-y"
            value={newProjectDescription}
            onChange={(e) => setNewProjectDescription(e.target.value)}
            placeholder="A brief overview of your project."
            disabled={creatingProject}
          ></textarea>
        </div>
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-200 ease-in-out disabled:opacity-50"
          disabled={creatingProject}
        >
          {creatingProject ? 'Creating...' : 'Create Project'}
        </button>
      </form>

      {projects.length === 0 ? (
        <p className="text-gray-600 text-lg">No projects yet. Create one above!</p>
      ) : (
        <div>
          <h3 className="text-xl font-semibold text-gray-700 mb-4">Available Projects</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => (
              <div
                key={project.id}
                className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm p-6 transform hover:scale-105 transition duration-200 ease-in-out cursor-pointer animate-scale-in"
                onClick={() => setSelectedProject(project)}
              >
                <h4 className="text-xl font-semibold text-indigo-700 mb-2">{project.name}</h4>
                <p className="text-gray-600 text-sm mb-3 line-clamp-3">{project.description || 'No description provided.'}</p>
                <div className="text-xs text-gray-500 mt-2">
                  Created: {project.createdAt?.toDate ? new Date(project.createdAt.toDate()).toLocaleDateString() : 'N/A'}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedProject(project); }}
                  className="mt-4 bg-indigo-500 hover:bg-indigo-600 text-white text-sm py-2 px-4 rounded-md shadow-md transition-colors"
                >
                  View Board
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- ProjectBoard Component ---
const ProjectBoard = ({ project, onBack, showToast }) => {
  const [tasks, setTasks] = useState([]);
  const { userId } = useContext(AuthContext);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null); // For TaskModal

  useEffect(() => {
    if (!project?.id) return;

    const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks`);
    const q = query(tasksRef, orderBy('createdAt'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTasks(fetchedTasks);
      console.log(`Tasks for project ${project.name} updated:`, fetchedTasks.length);
    }, (error) => {
      console.error("Error fetching tasks:", error);
    });

    return () => unsubscribe();
  }, [project?.id]);

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) {
      showToast("Task title cannot be empty.", "info");
      return;
    }
    try {
      const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks`);
      await addDoc(tasksRef, {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        status: 'todo', // Default status
        assignedTo: null,
        assignedToDisplayName: null,
        createdAt: serverTimestamp(),
        createdBy: userId,
        projectId: project.id // Redundant but good for queries
      });
      setNewTaskTitle('');
      setNewTaskDescription('');
      setShowAddTaskModal(false);
      showToast("Task added successfully!", "success");
    } catch (error) {
      console.error("Error adding task:", error);
      showToast("Error adding task.", "error");
    }
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
        <button
          onClick={onBack}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg flex items-center transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          Back to Projects
        </button>
        <h2 className="text-3xl font-bold text-indigo-700">{project.name} Board</h2>
        <button
          onClick={() => setShowAddTaskModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          Add New Task
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TaskList title="To Do" status="todo" tasks={tasks} setSelectedTask={setSelectedTask} />
        <TaskList title="In Progress" status="in-progress" tasks={tasks} setSelectedTask={setSelectedTask} />
        <TaskList title="Done" status="done" tasks={tasks} setSelectedTask={setSelectedTask} />
      </div>

      {showAddTaskModal && (
        <TaskModal
          title="Add New Task"
          onClose={() => setShowAddTaskModal(false)}
          onSubmit={handleAddTask}
          taskData={{ title: newTaskTitle, description: newTaskDescription }}
          setTaskData={{ setTitle: setNewTaskTitle, setDescription: setNewTaskDescription }}
          isNewTask={true}
          showToast={showToast}
        />
      )}

      {selectedTask && (
        <TaskModal
          title="Edit Task"
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          project={project}
          showToast={showToast}
        />
      )}
    </div>
  );
};

// --- TaskList Component ---
const TaskList = ({ title, status, tasks, setSelectedTask }) => {
  const filteredTasks = tasks.filter(task => task.status === status);

  return (
    <div className="bg-white rounded-lg shadow-md p-4 min-h-[300px] flex flex-col">
      <h3 className="text-xl font-semibold text-gray-700 border-b pb-3 mb-4">{title} ({filteredTasks.length})</h3>
      <div className="flex-grow space-y-3">
        {filteredTasks.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No tasks in this column.</p>
        ) : (
          filteredTasks.map(task => (
            <TaskCard key={task.id} task={task} setSelectedTask={setSelectedTask} />
          ))
        )}
      </div>
    </div>
  );
};

// --- TaskCard Component ---
const TaskCard = ({ task, setSelectedTask }) => {
  return (
    <div
      className="bg-gray-50 border border-gray-200 p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 animate-scale-in"
      onClick={() => setSelectedTask(task)}
    >
      <h4 className="text-lg font-medium text-gray-800 mb-1">{task.title}</h4>
      {task.description && (
        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{task.description}</p>
      )}
      {task.assignedToDisplayName && (
        <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
          {task.assignedToDisplayName}
        </span>
      )}
    </div>
  );
};

// --- TaskModal Component (for Add/Edit Task & Comments) ---
const TaskModal = ({ title, onClose, task, project, onSubmit, isNewTask = false, showToast }) => {
  const [currentTitle, setCurrentTitle] = useState(task?.title || '');
  const [currentDescription, setCurrentDescription] = useState(task?.description || '');
  const [currentStatus, setCurrentStatus] = useState(task?.status || 'todo');
  const [currentAssignedTo, setCurrentAssignedTo] = useState(task?.assignedTo || '');
  const [currentAssignedToDisplayName, setCurrentAssignedToDisplayName] = useState(task?.assignedToDisplayName || '');

  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const { userId, currentUser } = useContext(AuthContext); // Get currentUser to access displayName/email

  useEffect(() => {
    if (!isNewTask && task?.id && project?.id) {
      const commentsRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks/${task.id}/comments`);
      const q = query(commentsRef, orderBy('createdAt', 'asc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setComments(fetchedComments);
      }, (error) => {
        console.error("Error fetching comments:", error);
      });
      return () => unsubscribe();
    }
  }, [task?.id, project?.id, isNewTask]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (isNewTask) {
      onSubmit(e); // Call parent's onSubmit for new task creation
    } else {
      if (!currentTitle.trim()) {
        showToast("Task title cannot be empty.", "info");
        return;
      }
      try {
        const taskRef = doc(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks/${task.id}`);
        await updateDoc(taskRef, {
          title: currentTitle.trim(),
          description: currentDescription.trim(),
          status: currentStatus,
          assignedTo: currentAssignedTo || null,
          assignedToDisplayName: currentAssignedToDisplayName || null
        });
        showToast("Task updated successfully!", "success");
        onClose();
      } catch (error) {
        console.error("Error updating task:", error);
        showToast("Error updating task.", "error");
      }
    }
  };

  const handleDeleteTask = async () => {
    if (window.confirm("Are you sure you want to delete this task and all its comments? This action cannot be undone.")) {
      try {
        // Delete comments first (Firestore doesn't auto-delete subcollections)
        const commentsRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks/${task.id}/comments`);
        const commentDocs = await getDocs(commentsRef);
        const deleteCommentPromises = commentDocs.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deleteCommentPromises);

        // Then delete the task itself
        const taskRef = doc(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks/${task.id}`);
        await deleteDoc(taskRef);

        showToast("Task deleted successfully!", "success");
        onClose();
      } catch (error) {
        console.error("Error deleting task:", error);
        showToast("Error deleting task.", "error");
      }
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    try {
      const commentsRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks/${task.id}/comments`);
      await addDoc(commentsRef, {
        text: newCommentText.trim(),
        createdAt: serverTimestamp(),
        userId: userId,
        userName: currentUser?.displayName || currentUser?.email || 'Anonymous User' // Use display name or email if available
      });
      setNewCommentText('');
    } catch (error) {
      console.error("Error adding comment:", error);
      showToast("Error adding comment.", "error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 animate-fade-in-up">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto transform animate-scale-in">
        <div className="flex justify-between items-center border-b pb-4 mb-6">
          <h3 className="text-2xl font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-3xl">&times;</button>
        </div>

        <form onSubmit={handleSave}>
          <div className="mb-4">
            <label htmlFor="taskTitle" className="block text-gray-700 text-sm font-bold mb-2">Title:</label>
            <input
              type="text"
              id="taskTitle"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500"
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="taskDescription" className="block text-gray-700 text-sm font-bold mb-2">Description:</label>
            <textarea
              id="taskDescription"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500 h-24 resize-y"
              value={currentDescription}
              onChange={(e) => setCurrentDescription(e.target.value)}
            ></textarea>
          </div>

          {!isNewTask && (
            <>
              <div className="mb-4">
                <label htmlFor="taskStatus" className="block text-gray-700 text-sm font-bold mb-2">Status:</label>
                <select
                  id="taskStatus"
                  className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500"
                  value={currentStatus}
                  onChange={(e) => setCurrentStatus(e.target.value)}
                >
                  <option value="todo">To Do</option>
                  <option value="in-progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div className="mb-6">
                <label htmlFor="assignedTo" className="block text-gray-700 text-sm font-bold mb-2">Assigned To (User ID):</label>
                <input
                  type="text"
                  id="assignedTo"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500"
                  value={currentAssignedTo}
                  onChange={(e) => setCurrentAssignedTo(e.target.value)}
                  placeholder="Enter User ID (optional)"
                />
                 <label htmlFor="assignedToDisplayName" className="block text-gray-700 text-sm font-bold mb-2 mt-2">Assigned To (Display Name - optional):</label>
                <input
                  type="text"
                  id="assignedToDisplayName"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500"
                  value={currentAssignedToDisplayName}
                  onChange={(e) => setCurrentAssignedToDisplayName(e.target.value)}
                  placeholder="e.g., John Doe"
                />
              </div>
            </>
          )}

          <div className="flex justify-between items-center mb-6">
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-200 ease-in-out"
            >
              {isNewTask ? 'Add Task' : 'Save Changes'}
            </button>
            {!isNewTask && (
              <button
                type="button"
                onClick={handleDeleteTask}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-200 ease-in-out"
              >
                Delete Task
              </button>
            )}
          </div>
        </form>

        {!isNewTask && (
          <div className="mt-8 border-t pt-6">
            <h4 className="text-xl font-bold text-gray-800 mb-4">Comments</h4>
            <div className="max-h-48 overflow-y-auto mb-4 bg-gray-50 p-3 rounded-lg border">
              {comments.length === 0 ? (
                <p className="text-gray-500 text-sm">No comments yet. Be the first to add one!</p>
              ) : (
                comments.map(comment => (
                  <div key={comment.id} className="mb-3 p-2 border-b last:border-b-0 border-gray-100">
                    <p className="text-gray-800 text-sm">{comment.text}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      — {comment.userName || 'Anonymous'} at {comment.createdAt?.toDate ? new Date(comment.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </p>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleAddComment} className="flex gap-2">
              <textarea
                className="flex-grow shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-indigo-500 resize-none h-16"
                placeholder="Add a comment..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                required
              ></textarea>
              <button
                type="submit"
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-200 ease-in-out"
              >
                Post
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};


export default Root;