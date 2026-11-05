-- CreateTable
CREATE TABLE `admins` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(190) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN') NOT NULL DEFAULT 'ADMIN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admins_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `students` (
    `student_id` VARCHAR(32) NOT NULL,
    `first_name` VARCHAR(60) NOT NULL,
    `last_name` VARCHAR(60) NOT NULL,
    `dob` DATE NOT NULL,
    `sex` ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
    `class` VARCHAR(32) NOT NULL,
    `form` VARCHAR(32) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `face_descriptor` JSON NULL,
    `face_descriptor_hash` CHAR(64) NULL,
    `face_enrolled_at` DATETIME(3) NULL,
    `photo_path` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `students_class_form_idx`(`class`, `form`),
    INDEX `students_status_idx`(`status`),
    INDEX `students_face_enrolled_at_idx`(`face_enrolled_at`),
    PRIMARY KEY (`student_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `devices` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `location` VARCHAR(190) NOT NULL,
    `api_key_hash` CHAR(64) NOT NULL,
    `api_key_prefix` VARCHAR(16) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `last_seen_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `devices_api_key_hash_key`(`api_key_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `student_id` VARCHAR(32) NOT NULL,
    `date` DATE NOT NULL,
    `check_in_at` DATETIME(3) NULL,
    `check_out_at` DATETIME(3) NULL,
    `status` ENUM('PRESENT', 'LATE', 'ABSENT') NOT NULL DEFAULT 'PRESENT',
    `late_minutes` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `method` ENUM('FACE', 'MANUAL') NOT NULL DEFAULT 'FACE',
    `check_in_device_id` CHAR(36) NULL,
    `check_out_device_id` CHAR(36) NULL,
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_date_status_idx`(`date`, `status`),
    INDEX `attendance_student_id_date_idx`(`student_id`, `date` DESC),
    UNIQUE INDEX `attendance_student_id_date_key`(`student_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scan_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `device_id` CHAR(36) NULL,
    `student_id` VARCHAR(32) NULL,
    `action` ENUM('CHECK_IN', 'CHECK_OUT', 'UNRECOGNIZED') NOT NULL,
    `result` ENUM('SUCCESS', 'NO_FACE', 'MULTIPLE_FACES', 'NO_MATCH', 'ERROR') NOT NULL,
    `confidence` DOUBLE NULL,
    `image_path` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `scan_events_created_at_idx`(`created_at`),
    INDEX `scan_events_device_id_idx`(`device_id`),
    INDEX `scan_events_student_id_idx`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `school_name` VARCHAR(190) NOT NULL DEFAULT 'Greenfield Secondary School',
    `day_start_time` CHAR(5) NOT NULL DEFAULT '08:00',
    `late_grace_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 5,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Hong_Kong',
    `face_match_threshold` DOUBLE NOT NULL DEFAULT 0.6,
    `school_days` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`student_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_check_in_device_id_fkey` FOREIGN KEY (`check_in_device_id`) REFERENCES `devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_check_out_device_id_fkey` FOREIGN KEY (`check_out_device_id`) REFERENCES `devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scan_events` ADD CONSTRAINT `scan_events_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scan_events` ADD CONSTRAINT `scan_events_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`student_id`) ON DELETE SET NULL ON UPDATE CASCADE;

