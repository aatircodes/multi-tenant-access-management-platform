package saas_access_platform.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import saas_access_platform.dto.response.BasicUserResponse;
import saas_access_platform.dto.response.UserResponse;
import saas_access_platform.service.UserService;

import java.util.List;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping("/me-permissions")
    public ResponseEntity<List<String>> getMyPermissions() {
        return ResponseEntity.ok(userService.getCurrentUserPermissions());
    }

    @GetMapping("/me-roles")
    public ResponseEntity<List<String>> getMyRoles() {
        return ResponseEntity.ok(userService.getCurrentUserRoles());
    }

    @GetMapping
    @PreAuthorize("hasPermission(null, 'ROLE_READ') or hasPermission(null, 'ROLE_MANAGE') or hasPermission(null, 'ADMIN_TRANSFER') or hasPermission(null, 'USER_DEACTIVATE')")   // widened
    public ResponseEntity<List<UserResponse>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }

    @PatchMapping("/{userId}/deactivate")
    @PreAuthorize("hasPermission(null, 'USER_DEACTIVATE')")   // was USER_INVITE
    public ResponseEntity<Void> deactivateUser(@PathVariable Long userId) {
        userService.deactivateUser(userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/basic-info")
    public ResponseEntity<List<BasicUserResponse>> getBasicUserInfo() {
        return ResponseEntity.ok(userService.getBasicUserInfo());
    }
}